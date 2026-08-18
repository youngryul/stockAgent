import type { ReactElement } from "react";

import { displaySymbol, formatMoney, formatNumber } from "@/lib/format";
import type { PortfolioPosition } from "@/lib/types";

type HoldingsTableProps = {
  positions: PortfolioPosition[];
  onEdit?: (position: PortfolioPosition) => void;
  onRemove?: (id: number) => void;
};

/**
 * Full holdings list with quantity, cost, stop, and take-profit.
 */
export function HoldingsTable({
  positions,
  onEdit,
  onRemove,
}: HoldingsTableProps): ReactElement {
  const editable = Boolean(onEdit && onRemove);
  const colCount = editable ? 8 : 7;

  return (
    <div className="overflow-x-auto rounded-2xl border border-line">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="bg-ink-800 text-xs uppercase tracking-wide text-hold">
          <tr>
            <th className="px-4 py-3 font-medium">종목</th>
            <th className="px-4 py-3 font-medium">시장</th>
            <th className="px-4 py-3 font-medium">수량</th>
            <th className="px-4 py-3 font-medium">평균단가</th>
            <th className="px-4 py-3 font-medium">매수금액</th>
            <th className="px-4 py-3 font-medium">손절</th>
            <th className="px-4 py-3 font-medium">익절</th>
            {editable ? <th className="px-4 py-3 font-medium" /> : null}
          </tr>
        </thead>
        <tbody>
          {positions.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-10 text-center text-hold">
                아직 보유 종목이 없습니다.
              </td>
            </tr>
          ) : (
            positions.map((position) => (
              <tr key={position.id} className="border-t border-line/70">
                <td className="px-4 py-3 font-medium">
                  {displaySymbol(position.symbol, position.name)}
                </td>
                <td className="px-4 py-3 text-hold">
                  {position.market === "US" ? "미국" : "한국"}
                </td>
                <td className="px-4 py-3 font-mono num">{formatNumber(position.quantity)}</td>
                <td className="px-4 py-3 font-mono num">
                  {formatMoney(position.avgCost, position.market)}
                </td>
                <td className="px-4 py-3 font-mono num">
                  {formatMoney(position.costAmount, position.market)}
                </td>
                <td className="px-4 py-3 font-mono num">
                  {position.stopLoss === null
                    ? "-"
                    : formatMoney(position.stopLoss, position.market)}
                </td>
                <td className="px-4 py-3 font-mono num">
                  {position.takeProfit === null
                    ? "-"
                    : formatMoney(position.takeProfit, position.market)}
                </td>
                {editable ? (
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => onEdit?.(position)}
                      className="mr-2 text-hold hover:text-slate-100"
                    >
                      수정
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove?.(position.id)}
                      className="text-sell/80 hover:text-sell"
                    >
                      삭제
                    </button>
                  </td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
