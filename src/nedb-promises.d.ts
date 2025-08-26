declare module 'nedb-promises' {
  interface Datastore<T> {
    find(query: any): Promise<T[]>;
    findOne(query: any): Promise<T | null>;
    insert(doc: T): Promise<T>;
    update(query: any, update: any, options?: any): Promise<number>;
    remove(query: any, options?: any): Promise<number>;
  }
  const Datastore: {
    create<T>(options: { filename: string; autoload: boolean }): Datastore<T>;
  };
  export default Datastore;
}
