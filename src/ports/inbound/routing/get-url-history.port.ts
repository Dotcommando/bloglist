import type { IUrlHistoryEntry } from '../../../domain/routing/url-history-entry.js';

export interface IGetUrlHistoryInput {
  urlId: string;
}

export interface IGetUrlHistory {
  execute(input: IGetUrlHistoryInput): Promise<IUrlHistoryEntry[]>;
}
