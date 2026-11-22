declare module 'robots-parser' {
  interface IRobotsRules {
    isDisallowed(url: string, agent?: string): boolean | undefined;
    getMatchingLineNumber(url: string, agent?: string): number;
  }
  function robotsParser(url: string, content: string): IRobotsRules;
  export = robotsParser;
}
