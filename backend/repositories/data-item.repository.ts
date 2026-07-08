import { BaseRepository } from './base.js';
import { dataItems } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import type { DataItem } from '../types.js';

function toDataItem(d: typeof dataItems.$inferSelect): DataItem {
  return {
    id: d.id,
    entry_id: d.entryId,
    data_name: d.dataName,
    data_definition: d.dataDefinition,
    data_format: d.dataFormat,
    storage_description: d.storageDescription ?? undefined,
    schema_description: d.schemaDescription ?? undefined,
    schema_version: d.schemaVersion,
    responsible_person: d.responsiblePerson,
    updated_at: d.updatedAt,
  };
}

export class DataItemRepository extends BaseRepository {
  async findAll(): Promise<DataItem[]> {
    const rows = await this.db.select().from(dataItems);
    return rows.map(toDataItem);
  }

  async findByEntryId(entryId: number): Promise<DataItem | undefined> {
    const rows = await this.db
      .select()
      .from(dataItems)
      .where(eq(dataItems.entryId, entryId))
      .limit(1);
    return rows.length > 0 ? toDataItem(rows[0]) : undefined;
  }

  async upsert(input: Omit<DataItem, 'id' | 'updated_at'> & { id?: number }): Promise<DataItem> {
    const today = new Date().toISOString().split('T')[0];

    if (input.id) {
      await this.db
        .update(dataItems)
        .set({
          dataName: input.data_name,
          dataDefinition: input.data_definition,
          dataFormat: input.data_format,
          storageDescription: input.storage_description ?? null,
          schemaDescription: input.schema_description ?? null,
          schemaVersion: input.schema_version,
          responsiblePerson: input.responsible_person,
          updatedAt: today,
        })
        .where(eq(dataItems.id, input.id));
    } else {
      const existing = await this.findByEntryId(input.entry_id);
      if (existing) {
        await this.db
          .update(dataItems)
          .set({
            dataName: input.data_name,
            dataDefinition: input.data_definition,
            dataFormat: input.data_format,
            storageDescription: input.storage_description ?? null,
            schemaDescription: input.schema_description ?? null,
            schemaVersion: input.schema_version,
            responsiblePerson: input.responsible_person,
            updatedAt: today,
          })
          .where(eq(dataItems.entryId, input.entry_id));
      } else {
        await this.db.insert(dataItems).values({
          entryId: input.entry_id,
          dataName: input.data_name,
          dataDefinition: input.data_definition,
          dataFormat: input.data_format,
          storageDescription: input.storage_description ?? null,
          schemaDescription: input.schema_description ?? null,
          schemaVersion: input.schema_version,
          responsiblePerson: input.responsible_person,
          updatedAt: today,
        });
      }
    }

    return (await this.findByEntryId(input.entry_id))!;
  }

  async delete(id: number): Promise<void> {
    await this.db.delete(dataItems).where(eq(dataItems.id, id));
  }
}

export const dataItemRepository = new DataItemRepository();
