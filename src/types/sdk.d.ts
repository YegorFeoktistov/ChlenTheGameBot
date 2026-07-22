export type TableColumns = Record<string, unknown>;

export interface TelegramMessage {
  message_id: number;
  date: number;
  text?: string;
  chat: {
    id: number | string;
    title?: string;
    first_name?: string;
    type?: string;
  };
  from?: {
    id: number | string;
    first_name: string;
    last_name?: string;
    username?: string;
  };
}

declare module 'sdk' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export const api: {
    sendMessage(params: {
      chat_id: number | string;
      text: string;
      parse_mode?: string;
      reply_to_message_id?: number;
    }): Promise<any>;
  };

  export const db: {
    insert(table: any): any;
    select(fields?: any): any;
    update(table: any): any;
    delete(table: any): any;
    $count(table: any, condition?: any): Promise<number>;
  };
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

declare module 'sdk/db' {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  export function table(name: string, columns: TableColumns, extra?: (t: TableColumns) => any): any;
  export function integer(name: string, options?: any): any;
  export function text(name: string, options?: any): any;
  export function primaryKey(...columns: any[]): any;
  export function sql(strings: TemplateStringsArray, ...values: any[]): any;
  export function eq(a: any, b: any): any;
  export function and(...conditions: any[]): any;
  export function desc(column: any): any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
