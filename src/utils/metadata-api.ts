/* eslint-disable @typescript-eslint/no-explicit-any */

import axios from "axios";

import { config } from "@/config/index";

export class MetadataApi {
  static async getCollectionMetadata(contract: string, tokenId: string) {
    if (config.liquidityOnly) {
      // When running in liquidity-only mode, the collection id matches the contract
      return {
        id: contract,
        slug: "",
        name: "",
        community: null,
        metadata: null,
        royalties: null,
        contract,
        // All tokens within the contract
        tokenIdRange: null,
        tokenSetId: `contract:${contract}`,
      };
    } else {
      const url = `${config.metadataApiBaseUrl}/v3/${
        config.chainId === 1 ? "mainnet" : "rinkeby"
      }/collection?contract=${contract}&tokenId=${tokenId}`;

      const { data } = await axios.get(url);

      const collection: {
        id: string;
        slug: string;
        name: string;
        community: string | null;
        metadata: object | null;
        royalties: object | null;
        contract: string;
        tokenIdRange: [string, string] | null;
        tokenSetId: string;
      } = (data as any).collection;

      return collection;
    }
  }
}

export { MetadataApi as default };
