declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any): Database;
    exec(sql: string, params?: any): QueryExecResult[];
    each(sql: string, callback: (row: any) => void, done: () => void): void;
    prepare(sql: string, params?: any): Statement;
    export(): Uint8Array;
    close(): void;
    getRowsModified(): number;
  }

  export interface Statement {
    bind(params?: any): boolean;
    step(): boolean;
    getAsObject(params?: any): any;
    get(params?: any): any[];
    run(params?: any): void;
    reset(): void;
    free(): boolean;
    getColumnNames(): string[];
  }

  export interface QueryExecResult {
    columns: string[];
    values: any[][];
  }

  export interface SqlJsStatic {
    Database: {
      new (): Database;
      new (data?: ArrayLike<number> | Buffer | null): Database;
    };
  }

  export interface InitSqlJsOptions {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(options?: InitSqlJsOptions): Promise<SqlJsStatic>;
}
