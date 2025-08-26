declare module 'fs' {
  export function readFileSync(path: string, encoding: string): string;
  export function mkdirSync(path: string, opts?: any): void;
}

declare module 'path' {
  export function join(...paths: string[]): string;
  export function resolve(...paths: string[]): string;
}

declare module 'crypto' {
  export function randomBytes(size: number): { toString(encoding: string): string };
  export function scryptSync(password: string, salt: string, keylen: number): { toString(encoding: string): string };
}

declare module 'http' {
  export interface Server {
    listen(port: number, cb?: () => void): Server;
    address(): any;
    close(cb?: () => void): void;
  }
}

declare const process: { env: Record<string, string | undefined> };
declare const __dirname: string;
declare const require: any;
declare const module: any;
declare type Buffer = any;
