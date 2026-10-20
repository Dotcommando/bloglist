import type { IUrlHistoryEntry } from '../../../domain/routing/url-history-entry.js';

export interface IGetUrlHistoryInput {
  siteId: string;
  urlId: string;
}

export interface IGetUrlHistory {
  execute(input: IGetUrlHistoryInput): Promise<IUrlHistoryEntry[]>;
}
