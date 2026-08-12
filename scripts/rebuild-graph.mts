// Rebuild persisted knowledge graph relations.
// Usage: npm run graph:rebuild
import { rebuildSemanticRelations } from '../backend/services/graph-rebuild.service.js';

const result = await rebuildSemanticRelations();
console.log(JSON.stringify(result, null, 2));

if (!result.success) process.exit(1);
