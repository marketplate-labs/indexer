import { Request, RouteOptions } from "@hapi/hapi";
import * as Sdk from "@reservoir0x/sdk";
import Joi from "joi";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { formatEth, fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

const version = "v1";

export const getUsersLiquidityV1Options: RouteOptions = {
  description: "Get aggregate user liquidity.",
  tags: ["api", "orders"],
  validate: {
    query: Joi.object({
      collection: Joi.string(),
      user: Joi.string()
        .lowercase()
        .pattern(/^0x[a-f0-9]{40}$/),
      offset: Joi.number().integer().min(0).max(10000).default(0),
      limit: Joi.number().integer().min(1).max(20).default(20),
    }),
  },
  response: {
    schema: Joi.object({
      liquidity: Joi.array().items(
        Joi.object({
          user: Joi.string().pattern(/^0x[a-f0-9]{40}$/),
          rank: Joi.number().required(),
          tokenCount: Joi.number().required(),
          liquidity: Joi.number().unsafe().required(),
          maxTopBuyValue: Joi.number().unsafe().required(),
          wethBalance: Joi.number().unsafe().required(),
        })
      ),
    }).label(`getUsersLiquidity${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `get-users-liquidity-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const query = request.query as any;

    try {
      let baseQuery = `
        SELECT
          "t"."top_buy_maker" AS "user",
          SUM("t"."top_buy_value") as "liquidity",
          MAX("t"."top_buy_value") as "max_top_buy_value",
          RANK() OVER (ORDER BY SUM("t"."top_buy_value") DESC NULLS LAST) AS "rank",
          COUNT(*) AS "token_count"
        FROM "tokens" "t"
      `;

      const conditions: string[] = [`"t"."top_buy_maker" IS NOT NULL`];
      if (query.collection) {
        conditions.push(`"t"."collection_id" = $/collection/`);
      }
      if (conditions.length) {
        baseQuery += " WHERE " + conditions.map((c) => `(${c})`).join(" AND ");
      }

      // Grouping
      baseQuery += ` GROUP BY "t"."top_buy_maker"`;

      // Sorting
      baseQuery += ` ORDER BY "rank"`;

      // Pagination
      baseQuery += ` OFFSET $/offset/`;
      baseQuery += ` LIMIT $/limit/`;

      baseQuery = `
        WITH "x" AS (${baseQuery})
        SELECT
          "x".*,
          (
            SELECT
              COALESCE("fb"."amount", 0)
            FROM "ft_balances" "fb"
            WHERE "fb"."contract" = $/weth/
              and "fb"."owner" = "x"."user"
              and "fb"."amount" > 0
          ) AS "weth_balance"
        FROM "x"
      `;
      (query as any).weth = toBuffer(Sdk.Common.Addresses.Weth[config.chainId]);

      if (query.user) {
        (query as any).user = toBuffer(query.user);
        baseQuery += ` WHERE "x"."user" = $/user/`;
      }

      const result = await db.manyOrNone(baseQuery, query).then((result) =>
        result.map((r) => ({
          user: fromBuffer(r.user),
          rank: Number(r.rank),
          liquidity: formatEth(r.liquidity),
          maxTopBuyValue: formatEth(r.max_top_buy_value),
          tokenCount: Number(r.token_count),
          wethBalance: r.weth_balance ? formatEth(r.weth_balance) : null,
        }))
      );

      return { liquidity: result };
    } catch (error) {
      logger.error(
        `get-users-liquidity-${version}-handler`,
        `Handler failure: ${error}`
      );
      throw error;
    }
  },
};