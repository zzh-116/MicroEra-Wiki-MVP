 // Local file deduplication helper.
 // Reads analysis-output/entry-file-audit.json and moves duplicate physical
 // files to a trash directory, keeping one canonical copy.
 //
 // Dry-run by default. To actually move files:
 //   EXECUTE=1 node scripts/dedupe-local-files.mjs
 //
 // Outputs:
 //   - console plan (dry-run)
 //   - backend/data/.dedupe-trash/<date>/manifest.json (after EXECUTE=1)
 //   - backend/data/.dedupe-trash/<date>/.incomplete-manifest.json (on failure)
 import fs from 'node:fs/promises';
 import path from 'node:path';
 import { existsSync, readFileSync } from 'node:fs';
 import { createHash } from 'node:crypto';
 import { fileURLToPath } from 'node:url';

 const __dirname = path.dirname(fileURLToPath(import.meta.url));
 const DATA_DIR = path.resolve(__dirname, '../backend/data');
 const AUDIT_PATH = path.resolve(__dirname, '../analysis-output/entry-file-audit.json');
 const EXECUTE = process.env.EXECUTE === '1' || process.env.EXECUTE === 'true';

 const TRASH_DIR = path.resolve(DATA_DIR, `.dedupe-trash/${new Date().toISOString().slice(0, 10)}`);

 // Paths that are usually copies / translations / working copies.
 const KNOWN_COPY_PATTERNS = /-dual| dual|-mono| mono|-translated| translated|翻译| - 副本|-副本|副本|\(\d+\)|（\d+）/i;
 const KNOWN_COPY_FOLDERS = /新方向调研|甘蔗渣|利夫生物|翻译|bagasse3|paper2/;

 function canonicalScore(relPath) {
   const parts = relPath.split('/');
   const fileName = parts[parts.length - 1];
   let score = 0;
   // Prefer files directly under zaozhi/ root.
   if (parts[0] === 'zaozhi' && parts.length === 2) score += 200;
   else if (parts[0] === 'zaozhi') score += 100;
   // Avoid working-copy folders / suffixes.
   if (!KNOWN_COPY_FOLDERS.test(relPath)) score += 80;
   if (!KNOWN_COPY_PATTERNS.test(fileName)) score += 60;
   // Prefer shorter, shallower paths.
   score -= parts.length * 20;
   score -= fileName.length;
   return score;
 }

 function sha256Of(filePath) {
   return createHash('sha256').update(readFileSync(filePath)).digest('hex');
 }

 async function loadAudit() {
   if (!existsSync(AUDIT_PATH)) {
     console.error(`Missing audit report: ${AUDIT_PATH}`);
     console.error('Run: npx tsx scripts/audit-entry-files.mts');
     process.exit(1);
   }
   return JSON.parse(await fs.readFile(AUDIT_PATH, 'utf8'));
 }

 function buildGroups(reverse) {
   const bySha = new Map();
   for (const f of reverse) {
     const arr = bySha.get(f.sha256) ?? [];
     arr.push(f);
     bySha.set(f.sha256, arr);
   }
   return [...bySha.values()].filter((g) => g.length > 1);
 }

 function pickCanonical(group) {
   const sorted = [...group].sort((a, b) => canonicalScore(b.local_file) - canonicalScore(a.local_file));
   return sorted[0];
 }

 async function ensureDir(p) {
   await fs.mkdir(p, { recursive: true });
 }

 function abort(message, details) {
   console.error(`ABORT: ${message}`);
   if (details) console.error(details);
   process.exit(1);
 }

 async function main() {
   const audit = await loadAudit();
   const generatedAt = audit.generatedAt || 'unknown';
   const groups = buildGroups(audit.reverse ?? []);

   if (groups.length === 0) {
     console.log('No duplicate physical files found.');
     return;
   }

   // --- Pre-flight: verify every file in every group (including canonical) ---
   const shaCache = new Map(); // relPath -> currentSha

   for (const group of groups) {
     const checked = [];
     for (const f of group) {
       const src = path.join(DATA_DIR, f.local_file);
       if (!existsSync(src)) {
         abort(`file missing: ${f.local_file}`);
       }
       const currentSha = sha256Of(src);
       shaCache.set(f.local_file, currentSha);
       checked.push({ file: f, currentSha });
     }

     const uniqueShas = new Set(checked.map((x) => x.currentSha));
     if (uniqueShas.size !== 1) {
       const details = checked.map((x) => `  ${x.currentSha.slice(0, 8)} ${x.file.local_file}`).join('\n');
       abort('group SHA256 diverged (files are no longer identical)', details);
     }

     for (const x of checked) {
       if (x.currentSha !== x.file.sha256) {
         console.warn(
           `WARN: ${x.file.local_file} current SHA differs from audit (audit may be stale). Group is still identical, so dedupe is safe.`
         );
       }
     }
   }

   // --- Stale audit warning ---
   if (generatedAt !== 'unknown') {
     const auditDate = new Date(generatedAt);
     const daysOld = (Date.now() - auditDate.getTime()) / (1000 * 60 * 60 * 24);
     if (daysOld > 7) {
       console.warn(
         `WARN: audit report is ${Math.round(daysOld)} days old (generated ${generatedAt}). Consider regenerating with: npx tsx scripts/audit-entry-files.mts`
       );
     }
   }

   // --- Build plan and canonical coverage warnings ---
   const plan = [];
   const notes = [
     'This cleanup only removes duplicate physical copies.',
     `Per audit (generated ${generatedAt}), wiki_files is empty and entries.summary/content do not store full physical paths, so no DB correction is required.`,
     'Moved files are placed in the trash directory and can be restored manually.'
   ];

   for (const group of groups) {
     const canonical = pickCanonical(group);
     const duplicates = group.filter((f) => f.local_file !== canonical.local_file);
     plan.push({
       sha256: shaCache.get(canonical.local_file),
       canonical: canonical.local_file,
       duplicates: duplicates.map((d) => d.local_file),
     });

     const canonicalEntries = new Set(canonical.matched_entry_ids ?? []);
     for (const dup of duplicates) {
       for (const eid of dup.matched_entry_ids ?? []) {
         if (!canonicalEntries.has(eid)) {
           console.warn(
             `WARN: canonical ${canonical.local_file} does not cover entry ${eid} which is matched by duplicate ${dup.local_file}. This may be a false positive due to loose audit matching.`
           );
         }
       }
     }
   }

   // --- Dry-run output ---
   console.log(
     `Found ${groups.length} duplicate file group(s) affecting ${groups.reduce((n, g) => n + g.length, 0)} file(s).`
   );
   console.log('');

   for (const note of notes) {
     console.log(`NOTE: ${note}`);
   }
   console.log('');

   for (const p of plan) {
     console.log(`[${p.sha256.slice(0, 8)}] KEEP   ${p.canonical}`);
     for (const d of p.duplicates) console.log(`            MOVE   ${d}`);
   }

   if (!EXECUTE) {
     console.log('\nThis was a dry run. Set EXECUTE=1 to move duplicates to:');
     console.log(`  ${TRASH_DIR}`);
     return;
   }

   // --- Execute: move duplicates to trash ---
   await ensureDir(TRASH_DIR);

   const manifest = {
     movedAt: new Date().toISOString(),
     canonicalBase: DATA_DIR,
     trashDir: path.relative(DATA_DIR, TRASH_DIR).replace(/\\/g, '/'),
     auditGeneratedAt: generatedAt,
     notes,
     groups: [],
   };

   try {
     for (const p of plan) {
       const groupManifest = { canonical: p.canonical, duplicates: [] };
       manifest.groups.push(groupManifest);

       for (const dup of p.duplicates) {
         const src = path.join(DATA_DIR, dup);
         const dst = path.join(TRASH_DIR, dup);
         if (existsSync(dst)) {
           throw new Error(`destination already exists: ${dst}`);
         }
         await ensureDir(path.dirname(dst));
         await fs.rename(src, dst);
         groupManifest.duplicates.push({
           from: dup,
           to: path.relative(DATA_DIR, dst).replace(/\\/g, '/'),
         });
         console.log(`MOVED ${dup} -> ${path.relative(DATA_DIR, dst)}`);
       }
     }

     const manifestPath = path.join(TRASH_DIR, 'manifest.json');
     await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
     console.log(`\nManifest written to: ${manifestPath}`);
   } catch (err) {
     const incompletePath = path.join(TRASH_DIR, '.incomplete-manifest.json');
     await fs.writeFile(
       incompletePath,
       JSON.stringify(
         {
           ...manifest,
           error: err.message,
           errorAt: new Date().toISOString(),
         },
         null,
         2
       ),
       'utf8'
     );
     console.error(`\nERROR: move failed - ${err.message}`);
     console.error(`Incomplete manifest written to: ${incompletePath}`);
     process.exit(1);
   }
 }

 main().catch((err) => {
   console.error(err);
   process.exit(1);
 });
