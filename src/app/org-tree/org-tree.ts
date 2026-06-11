import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';
import { ButtonModule } from 'primeng/button';

type Kind = 'division' | 'department';

interface OrgItem {
  id: string;
  name: string;
  kind: Kind;
  /** ระดับการเยื้อง 0 = ระดับบนสุด ใช้เฉพาะรายการในโซนขวา */
  depth: number;
}

interface PlacedRow extends OrgItem {
  canIndent: boolean;
  canOutdent: boolean;
  parentName: string | null;
}

const INDENT_REM = 1.75;
/** ระยะลากแนวนอนต่อ 1 ระดับการเยื้อง (พิกเซล) ~ เท่ากับระยะเยื้องที่แสดงผล */
const INDENT_PX = 28;

/** 10 หน่วยงานเริ่มต้น วางไว้ในคลังด้านซ้ายให้ลากไปจัด */
function initialPalette(): OrgItem[] {
  const seed: ReadonlyArray<[string, string, Kind]> = [
    ['ops', 'ฝ่ายปฏิบัติการ', 'division'],
    ['fin', 'ฝ่ายการเงินและบัญชี', 'division'],
    ['hr', 'ฝ่ายทรัพยากรบุคคล', 'division'],
    ['mkt', 'ฝ่ายการตลาด', 'division'],
    ['it', 'ฝ่ายเทคโนโลยีสารสนเทศ', 'division'],
    ['prod', 'แผนกผลิต', 'department'],
    ['wh', 'แผนกคลังสินค้า', 'department'],
    ['acc', 'แผนกบัญชี', 'department'],
    ['tre', 'แผนกการเงิน', 'department'],
    ['rec', 'แผนกสรรหาว่าจ้าง', 'department'],
  ];
  return seed.map(([id, name, kind]) => ({ id, name, kind, depth: 0 }));
}

const ICON_BY_KIND: Record<Kind, string> = {
  division: 'pi pi-sitemap',
  department: 'pi pi-users',
};

/**
 * บังคับให้โครงเยื้องถูกต้องเสมอ: แถวแรกต้องอยู่ระดับ 0
 * และแต่ละแถวลึกได้มากสุดแค่ลึกกว่าแถวก่อนหน้า 1 ระดับ
 */
function normalizeDepths(list: OrgItem[]): void {
  for (let i = 0; i < list.length; i++) {
    const max = i === 0 ? 0 : list[i - 1].depth + 1;
    list[i].depth = Math.max(0, Math.min(list[i].depth, max));
  }
}

@Component({
  selector: 'app-org-tree',
  imports: [CdkDropList, CdkDrag, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-5xl p-6">
      <header class="mb-5">
        <h1 class="text-2xl font-semibold text-slate-900">จัดผังองค์กร (ลากวาง)</h1>
        <p class="mt-1 text-slate-600">
          ลากหน่วยงานจาก <strong>คลังด้านซ้าย</strong> มาวางใน
          <strong>โซนด้านขวา</strong> — ลากเยื้อง
          <strong>ไปทางขวาเพื่อให้เป็นลูก</strong> (ซ้อนได้ไม่จำกัดชั้น) หรือ
          ไปทางซ้ายเพื่อเลื่อนขึ้นเป็นแม่ ปุ่ม
          <i class="pi pi-angle-left text-xs"></i> /
          <i class="pi pi-angle-right text-xs"></i>
          ก็ปรับระดับทั้งกิ่งได้เช่นกัน
        </p>
      </header>

      <div class="mb-4 flex items-center gap-3">
        <p-button
          label="คืนค่าเริ่มต้น"
          icon="pi pi-refresh"
          severity="secondary"
          size="small"
          (onClick)="reset()"
        />
        <span class="text-sm text-slate-500">
          จัดแล้ว {{ placed().length }} / รวม {{ total }} หน่วยงาน
        </span>
      </div>

      <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
        <!-- ── คลังด้านซ้าย ─────────────────────────── -->
        <div>
          <h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            คลังหน่วยงาน
          </h2>
          <div
            cdkDropList
            #palette="cdkDropList"
            [cdkDropListData]="paletteItems()"
            [cdkDropListConnectedTo]="[placedZone]"
            (cdkDropListDropped)="drop($event)"
            class="flex min-h-72 flex-col gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-3"
          >
            @for (item of paletteItems(); track item.id) {
              <div
                cdkDrag
                class="flex cursor-grab items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm active:cursor-grabbing"
              >
                <i class="pi pi-bars text-slate-300"></i>
                <i [class]="icon(item.kind)" class="text-slate-500"></i>
                <span class="text-slate-800">{{ item.name }}</span>
              </div>
            } @empty {
              <p class="m-auto text-sm text-slate-400">จัดครบทุกหน่วยงานแล้ว 🎉</p>
            }
          </div>
        </div>

        <!-- ── โซนจัดผังด้านขวา ──────────────────────── -->
        <div>
          <h2 class="mb-2 text-sm font-semibold tracking-wide text-slate-500 uppercase">
            ผังองค์กร
          </h2>
          <div
            cdkDropList
            #placedZone="cdkDropList"
            [cdkDropListData]="placed()"
            [cdkDropListConnectedTo]="[palette]"
            (cdkDropListDropped)="drop($event)"
            class="flex min-h-72 flex-col gap-2 rounded-lg border-2 border-dashed border-indigo-300 bg-indigo-50/40 p-3"
          >
            @for (row of rows(); track row.id) {
              <div
                cdkDrag
                class="flex items-center gap-2 rounded-md border-l-4 border-indigo-400 bg-white px-2 py-2 shadow-sm"
                [style.margin-left.rem]="row.depth * indentRem"
              >
                <i cdkDragHandle class="pi pi-bars cursor-grab text-slate-300 active:cursor-grabbing"></i>
                <i [class]="icon(row.kind)" class="text-indigo-500"></i>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-slate-800">{{ row.name }}</div>
                  <div class="text-xs text-slate-400">
                    @if (row.parentName) {
                      ภายใต้: {{ row.parentName }}
                    } @else {
                      ระดับบนสุด
                    }
                  </div>
                </div>
                <button
                  type="button"
                  class="rounded p-1 text-slate-500 enabled:hover:bg-slate-100 disabled:opacity-30"
                  [disabled]="!row.canOutdent"
                  [attr.aria-label]="'เยื้องออก ' + row.name"
                  (click)="changeDepth($index, -1)"
                >
                  <i class="pi pi-angle-left"></i>
                </button>
                <button
                  type="button"
                  class="rounded p-1 text-slate-500 enabled:hover:bg-slate-100 disabled:opacity-30"
                  [disabled]="!row.canIndent"
                  [attr.aria-label]="'เยื้องเข้า ' + row.name"
                  (click)="changeDepth($index, 1)"
                >
                  <i class="pi pi-angle-right"></i>
                </button>
              </div>
            } @empty {
              <p class="m-auto text-center text-sm text-indigo-400">
                ลากหน่วยงานมาวางที่นี่เพื่อเริ่มจัดผัง
              </p>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    .cdk-drag-preview {
      box-shadow:
        0 5px 5px -3px rgb(0 0 0 / 0.2),
        0 8px 10px 1px rgb(0 0 0 / 0.14);
      border-radius: 0.375rem;
      opacity: 0.95;
    }
    .cdk-drag-placeholder {
      opacity: 0.4;
      border-style: dashed;
    }
    .cdk-drag-animating {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
    .cdk-drop-list-dragging .cdk-drag:not(.cdk-drag-placeholder) {
      transition: transform 200ms cubic-bezier(0, 0, 0.2, 1);
    }
  `,
})
export class OrgTree {
  protected readonly indentRem = INDENT_REM;
  protected readonly total = initialPalette().length;

  protected readonly paletteItems = signal<OrgItem[]>(initialPalette());
  protected readonly placed = signal<OrgItem[]>([]);

  /** มุมมองของโซนขวาพร้อมข้อมูลช่วยแสดงผล (แม่คือใคร, เยื้องได้ไหม) */
  protected readonly rows = computed<PlacedRow[]>(() => {
    const list = this.placed();
    return list.map((item, i) => {
      const prev = list[i - 1];
      return {
        ...item,
        canOutdent: item.depth > 0,
        canIndent: i > 0 && item.depth <= prev.depth,
        parentName: this.findParentName(list, i),
      };
    });
  });

  protected icon(kind: Kind): string {
    return ICON_BY_KIND[kind];
  }

  protected drop(event: CdkDragDrop<OrgItem[]>): void {
    const palette = [...this.paletteItems()];
    const placed = [...this.placed()];
    const intoPlaced = event.container.data === this.placed();

    if (event.previousContainer === event.container) {
      const target = intoPlaced ? placed : palette;
      moveItemInArray(target, event.previousIndex, event.currentIndex);
      if (intoPlaced) {
        // ลากไปทางขวา = เยื้องลึกขึ้น (เป็นลูก), ลากไปซ้าย = ตื้นขึ้น
        const delta = Math.round(event.distance.x / INDENT_PX);
        placed[event.currentIndex].depth += delta;
      }
    } else {
      const from = intoPlaced ? palette : placed;
      const to = intoPlaced ? placed : palette;
      transferArrayItem(from, to, event.previousIndex, event.currentIndex);
      if (intoPlaced) {
        // หน่วยงานที่เพิ่งลากเข้ามา ให้เริ่มเป็นพี่น้องกับแถวเหนือมัน แล้วค่อยลากขวาเพื่อให้เป็นลูก
        const above = placed[event.currentIndex - 1];
        placed[event.currentIndex].depth = above ? above.depth : 0;
      }
    }

    normalizeDepths(placed);
    this.paletteItems.set(palette.map((it) => ({ ...it, depth: 0 })));
    this.placed.set(placed.map((it) => ({ ...it })));
  }

  protected changeDepth(index: number, delta: 1 | -1): void {
    const list = this.placed();
    const node = list[index];
    if (delta === 1 && (index === 0 || node.depth > list[index - 1].depth)) return;
    if (delta === -1 && node.depth === 0) return;

    // ขยับทั้งกิ่ง: แถวถัดไปที่ลึกกว่า node ถือเป็นลูกหลานของมัน
    let end = index + 1;
    while (end < list.length && list[end].depth > node.depth) end++;

    const next = list.map((it, i) =>
      i >= index && i < end ? { ...it, depth: it.depth + delta } : { ...it },
    );
    normalizeDepths(next);
    this.placed.set(next);
  }

  protected reset(): void {
    this.paletteItems.set(initialPalette());
    this.placed.set([]);
  }

  /** หาแม่ของแถว i = แถวก่อนหน้าที่ใกล้สุดซึ่งตื้นกว่า 1 ระดับ */
  private findParentName(list: OrgItem[], i: number): string | null {
    const target = list[i].depth - 1;
    if (target < 0) return null;
    for (let j = i - 1; j >= 0; j--) {
      if (list[j].depth === target) return list[j].name;
      if (list[j].depth < target) break;
    }
    return null;
  }
}
