import Hashids from 'hashids';

// HashIds service for encoding/decoding IDs
export class HashidsService {
  private readonly hashids: Hashids;

  constructor(salt: string = 'GzFbxMxQkArX1cLMo3tnGmpNxL5lUOROXXum5xfhiPU=', minLength: number = 6) {
    this.hashids = new Hashids(salt, minLength);
  }

  encode(id: number): string {
    return this.hashids.encode(id);
  }

  decode(hashId: string): number | null {
    const decoded = this.hashids.decode(hashId);
    return decoded.length > 0 ? decoded[0] as number : null;
  }

  decodeMany(hashIds: string[]): number[] {
    return hashIds.map(hashId => this.decode(hashId)).filter(id => id !== null) as number[];
  }

  encodeMany(ids: number[]): string[] {
    return ids.map(id => this.encode(id));
  }
}

// Default instance with production settings
export const hashidsService = new HashidsService();