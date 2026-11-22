declare module 'parse-srcset' {
  interface ISourceSetCandidate {
    url: string;
    w?: number;
    d?: number;
    h?: number;
  }

  export default function parseSrcset(value: string): readonly ISourceSetCandidate[];
}
