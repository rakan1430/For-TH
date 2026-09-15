import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";
import { moveItem, orderChanged } from "../lib/reorder";

/**
 * قائمةٌ يُعاد ترتيبها **بالسحب**.
 *
 * ⚠️ لماذا بأحداث المؤشّر (Pointer Events) لا بسحب HTML5؟
 *    لأنّ سحب HTML5 (`draggable` و`dragstart`) **لا يعمل على شاشات اللمس
 *    إطلاقاً**. والمعلّم قد يرتّب بنكه من جوّاله. وأحداث المؤشّر تغطّي
 *    الفأرة واللمس والقلم بشفرةٍ واحدة.
 *
 * ⚠️ ومعها دائماً زرّا «أعلى/أسفل»: السحب وحده لا يبلغه من يستعمل لوحة
 *    مفاتيح أو قارئ شاشة، ويصعب على من في يده رعشة. والزرّان ليسا احتياطاً
 *    للسحب بل طريقٌ مكافئ.
 */

export interface SortableApi {
  handleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: React.CSSProperties;
    "aria-hidden": true;
  };
  moveUp: () => void;
  moveDown: () => void;
  isDragging: boolean;
  index: number;
  total: number;
}

export function Sortable<T>({
  items, getKey, onReorder, renderItem, label,
}: {
  items: T[];
  getKey: (item: T) => string;
  onReorder: (next: T[]) => void;
  renderItem: (item: T, api: SortableApi) => ReactNode;
  label?: string;
}) {
  const [order, setOrder] = useState<T[]>(items);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const containerRef = useRef<HTMLUListElement>(null);
  const committedRef = useRef<T[]>(items);

  // مزامنةٌ مع الخارج — إلّا أثناء السحب، فالمزامنة حينها تقاتل إصبع المستخدم
  useEffect(() => {
    if (dragKey === null) {
      setOrder(items);
      committedRef.current = items;
    }
  }, [items, dragKey]);

  // الحساب في `lib/reorder.ts` — دالّةٌ خالصة مفحوصة وحدها
  const move = (from: number, to: number) => moveItem(order, from, to);

  function commit(next: T[]) {
    setOrder(next);
    committedRef.current = next;
    onReorder(next);
  }

  function onPointerDown(key: string, e: React.PointerEvent) {
    // الزرّ الأيسر أو لمسة — لا القائمة السياقية
    if (e.button !== 0 && e.pointerType === "mouse") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragKey(key);
    e.preventDefault();
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragKey === null) return;
    // ⚠️ التقاط المؤشّر يوجّه الأحداث إلى المقبض، فلا يفيد `e.target`.
    //    نسأل الصفحة: أي عنصرٍ تحت الإصبع الآن؟
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest<HTMLElement>("[data-sortable-key]");
    const overKey = row?.dataset.sortableKey;
    if (!overKey || overKey === dragKey) return;

    const from = order.findIndex((it) => getKey(it) === dragKey);
    const to = order.findIndex((it) => getKey(it) === overKey);
    if (from === -1 || to === -1) return;
    setOrder(move(from, to));
  }

  function onPointerUp(e: React.PointerEvent) {
    if (dragKey === null) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* المؤشّر قد يكون أُفلت أصلاً */
    }
    setDragKey(null);
    // لا نُرسل إلى الخادم إن لم يتغيّر شيء: ضغطةٌ بلا سحبٍ ليست إعادة ترتيب
    if (orderChanged(committedRef.current, order, getKey)) commit(order);
  }

  return (
    <>
      <ul
        ref={containerRef}
        className="stack-s"
        style={{ listStyle: "none", padding: 0, margin: 0 }}
        aria-label={label}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {order.map((item, index) => {
          const key = getKey(item);
          const isDragging = key === dragKey;
          return (
            <li
              key={key}
              data-sortable-key={key}
              style={{
                opacity: isDragging ? 0.6 : 1,
                outline: isDragging ? "2px solid var(--accent)" : "none",
                outlineOffset: "2px",
              }}
            >
              {renderItem(item, {
                handleProps: {
                  onPointerDown: (e) => onPointerDown(key, e),
                  // ⚠️ بدونها يمرّر المتصفّح اللمسة إلى تمرير الصفحة فلا يقع سحب
                  style: { touchAction: "none", cursor: "grab" },
                  "aria-hidden": true,
                },
                moveUp: () => {
                  const next = move(index, index - 1);
                  if (orderChanged(order, next, getKey)) {
                    commit(next);
                    setAnnounce(`نُقل إلى الموضع ${index} من ${order.length}`);
                  }
                },
                moveDown: () => {
                  const next = move(index, index + 1);
                  if (orderChanged(order, next, getKey)) {
                    commit(next);
                    setAnnounce(`نُقل إلى الموضع ${index + 2} من ${order.length}`);
                  }
                },
                isDragging,
                index,
                total: order.length,
              })}
            </li>
          );
        })}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">{announce}</span>
    </>
  );
}

/** مقبض السحب مع زرّي النقل — الشكل الموحّد لكل قائمةٍ مرتَّبة. */
export function DragHandle({ api, title }: { api: SortableApi; title: string }) {
  return (
    <span className="row" style={{ gap: "2px", flexWrap: "nowrap" }}>
      <span
        {...api.handleProps}
        className="muted"
        style={{ ...api.handleProps.style, display: "inline-flex", padding: "6px" }}
      >
        <Icon name="grip" size={18} />
      </span>
      <button
        type="button" className="btn btn--quiet btn--sm"
        style={{ minHeight: "32px", padding: "0 6px" }}
        onClick={api.moveUp} disabled={api.index === 0}
        aria-label={`تحريك ${title} للأعلى`}
      >
        <Icon name="up" size={16} />
      </button>
      <button
        type="button" className="btn btn--quiet btn--sm"
        style={{ minHeight: "32px", padding: "0 6px" }}
        onClick={api.moveDown} disabled={api.index === api.total - 1}
        aria-label={`تحريك ${title} للأسفل`}
      >
        <Icon name="down" size={16} />
      </button>
    </span>
  );
}
