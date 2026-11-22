export interface IResolutionCalendarPort {
  today(at: Date, timeZone: string): string;
  range(from: string, to: string, timeZone: string): { from: Date; until: Date };
}
