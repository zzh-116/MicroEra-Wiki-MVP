// Connector Registry — pluggable registry for data source connectors.
// Follows the same pattern as ParserFactory for consistency.
// New connectors (Feishu, Confluence, GitLab Wiki, Notion) register here
// without modifying any core pipeline code.

import type { Connector } from './types.js';

const registry = new Map<string, () => Connector>();

export class ConnectorRegistry {
  /** Register a connector factory */
  static register(name: string, factory: () => Connector): void {
    if (registry.has(name)) {
      console.warn(`[ConnectorRegistry] Overwriting existing connector: "${name}"`);
    }
    registry.set(name, factory);
    console.log(`[ConnectorRegistry] Registered: "${name}"`);
  }

  /** Get a connector instance by name */
  static get(name: string): Connector {
    const factory = registry.get(name);
    if (!factory) {
      const available = [...registry.keys()].join(', ');
      throw new Error(`Unknown connector "${name}". Available: ${available || '(none)'}`);
    }
    return factory();
  }

  /** List all registered connector names */
  static list(): string[] {
    return [...registry.keys()];
  }

  /** Check if a connector is registered */
  static has(name: string): boolean {
    return registry.has(name);
  }

  /** Get all connector instances */
  static getAll(): Connector[] {
    return [...registry.values()].map((f) => f());
  }

  /** Remove a connector (for testing/hot-swap) */
  static unregister(name: string): void {
    registry.delete(name);
  }
}
