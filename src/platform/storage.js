export class StorageError extends Error { constructor(code,message){super(message);this.name="StorageError";this.code=code;} }
export class StorageProvider {
  async put(){throw new StorageError("NOT_IMPLEMENTED","No storage provider configured.");}
  async get(){throw new StorageError("NOT_IMPLEMENTED","No storage provider configured.");}
  async delete(){throw new StorageError("NOT_IMPLEMENTED","No storage provider configured.");}
}
