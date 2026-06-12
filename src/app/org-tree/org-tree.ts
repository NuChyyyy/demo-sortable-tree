import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
  transferArrayItem,
} from '@angular/cdk/drag-drop';

type Kind = 'org' | 'division' | 'department' | 'team' | 'person';

interface OrgItem {
  id: string;
  name: string;
  kind: Kind;
  /** ระดับการเยื้อง 0 = ระดับบนสุด */
  depth: number;
}

/** ชนิดของเส้นโครงสร้างในแต่ละช่องเยื้อง */
type Guide = 'space' | 'line' | 'tee' | 'ell';

interface PlacedRow extends OrgItem {
  canIndent: boolean;
  canOutdent: boolean;
  parentName: string | null;
  guides: Guide[];
}

/** ความกว้างของช่องเยื้อง 1 ระดับ (พิกเซล) ใช้ทั้งวาดเส้นและคำนวณการลากเยื้อง */
const INDENT_PX = 24;

const ICON_BY_KIND: Record<Kind, string> = {
  org: 'pi pi-building',
  division: 'pi pi-sitemap',
  department: 'pi pi-briefcase',
  team: 'pi pi-users',
  person: 'pi pi-user',
};

/** โครงสร้างองค์กรเริ่มต้น (อ้างอิงผัง สนง.คปภ. สายตรวจสอบ) วางไว้ในโซนขวาให้เห็นเส้นเลย */
function initialPlaced(): OrgItem[] {
  const seed: ReadonlyArray<[string, string, Kind, number]> = [
    ['n1', 'สำนักงาน คปภ. (เลขาธิการ)', 'org', 0],
    ['n2', 'ด้านกฎหมายและตรวจสอบ (รองเลขาธิการ)', 'division', 1],
    ['n3', 'สายตรวจสอบ (ผู้ช่วยเลขาธิการ)', 'division', 2],
    ['n4', 'ฝ่ายตรวจสอบ 1 (ผู้อำนวยการฝ่ายอาวุโส)', 'department', 3],
    ['n5', 'กลุ่มพัฒนาและกลยุทธ์การตรวจสอบ (หัวหน้ากลุ่ม)', 'team', 4],
    ['n6', 'กลุ่มพัฒนาและกลยุทธ์การตรวจสอบ', 'team', 5],
    ['n7', 'กลุ่มตรวจสอบ 1 (หัวหน้ากลุ่ม)', 'team', 4],
    ['n8', 'กลุ่มตรวจสอบ 1', 'team', 5],
    ['n9', 'กลุ่มงานตรวจสอบ 2 (ผู้อำนวยการกลุ่มงาน)', 'department', 3],
    ['n10', 'กลุ่มตรวจสอบ 2/1 (หัวหน้ากลุ่ม)', 'team', 4],
    ['n11', 'กลุ่มตรวจสอบ 2/1', 'team', 5],
    ['n12', 'กลุ่มตรวจสอบ 2/2 (หัวหน้ากลุ่ม)', 'team', 4],
    ['n13', 'กลุ่มตรวจสอบ 2/2', 'team', 5],
    ['n14', 'กลุ่มงานตรวจสอบ 3 (ผู้อำนวยการกลุ่มงาน)', 'department', 3],
    ['n15', 'กลุ่มตรวจสอบ 3/1 (หัวหน้ากลุ่ม)', 'team', 4],
    ['n16', 'กลุ่มตรวจสอบ 3/1', 'team', 5],
    ['n17', 'กลุ่มตรวจสอบ 3/2 (หัวหน้ากลุ่ม)', 'team', 4],
    ['n18', 'กลุ่มตรวจสอบ 3/2', 'team', 5],
  ];
  return seed.map(([id, name, kind, depth]) => ({ id, name, kind, depth }));
}

/** หน่วยงานที่ยังไม่ถูกจัด รอลากเข้าโครงสร้าง */
function initialPalette(): OrgItem[] {
  const seed: ReadonlyArray<[string, string, Kind]> = [
    ['p1', 'ฝ่ายตรวจสอบ 2', 'department'],
    ['p2', 'กลุ่มตรวจสอบ 4', 'team'],
  ];
  return seed.map(([id, name, kind]) => ({ id, name, kind, depth: 0 }));
}

/** บังคับให้โครงเยื้องถูกต้อง: แถวแรก depth 0 และห้ามลึกเกินแถวก่อนหน้า +1 */
function normalizeDepths(list: OrgItem[]): void {
  for (let i = 0; i < list.length; i++) {
    const max = i === 0 ? 0 : list[i - 1].depth + 1;
    list[i].depth = Math.max(0, Math.min(list[i].depth, max));
  }
}

/** มีแถวถัดไปที่ depth == t ก่อนจะเจอแถวที่ตื้นกว่า t หรือไม่ (ใช้ตัดสินว่าเส้นต่อลงล่างไหม) */
function continuesAtDepth(list: OrgItem[], i: number, t: number): boolean {
  for (let j = i + 1; j < list.length; j++) {
    if (list[j].depth < t) return false;
    if (list[j].depth === t) return true;
  }
  return false;
}

@Component({
  selector: 'app-org-tree',
  imports: [CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mx-auto max-w-6xl p-6">
      <header class="mb-5">
        <h1 class="text-2xl font-semibold text-slate-800">จัดลำดับขั้นกลุ่มงาน</h1>
        <p class="mt-1 text-sm text-slate-500">
          ลากหน่วยงานจาก <strong>คลังด้านซ้าย</strong> มาวางในโครงสร้างด้านขวา —
          ลากเยื้อง <strong>ไปทางขวาเพื่อให้เป็นลูก</strong> (ซ้อนได้ไม่จำกัดชั้น)
          หรือไปทางซ้ายเพื่อเลื่อนขึ้นเป็นแม่
        </p>
      </header>

      <div class="mb-4 flex items-center gap-4">
        <button
          type="button"
          class="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-violet-600 hover:bg-violet-50"
          (click)="reset()"
        >
          <i class="pi pi-refresh text-xs"></i> คืนค่าเริ่มต้น
        </button>
        <span class="text-sm text-slate-500">
          จัดแล้ว {{ placed().length }} / รวม {{ total }} กลุ่ม
        </span>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-[20rem_1fr]">
        <!-- ── คลังด้านซ้าย ─────────────────────────── -->
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span class="h-4 w-1 rounded-full bg-violet-500"></span>
            คลังกลุ่มงาน
          </h2>
          <div
            cdkDropList
            #palette="cdkDropList"
            [cdkDropListData]="paletteItems()"
            [cdkDropListConnectedTo]="[placedZone]"
            (cdkDropListDropped)="drop($event)"
            class="flex min-h-64 flex-col gap-2"
          >
            @for (item of paletteItems(); track item.id) {
              <div
                cdkDrag
                class="flex cursor-grab items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 transition-colors hover:border-violet-300 hover:bg-violet-50/50 active:cursor-grabbing"
              >
                <i class="pi pi-bars text-slate-300"></i>
                <i [class]="icon(item.kind)" class="text-violet-500"></i>
                <span class="text-sm text-slate-700">{{ item.name }}</span>
              </div>
            } @empty {
              <p class="m-auto py-8 text-sm text-slate-400">จัดครบทุกหน่วยงานแล้ว 🎉</p>
            }
          </div>
        </div>

        <!-- ── โครงสร้างด้านขวา ──────────────────────── -->
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 class="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <span class="h-4 w-1 rounded-full bg-violet-500"></span>
            โครงสร้างลำดับขั้น
          </h2>
          <div
            cdkDropList
            #placedZone="cdkDropList"
            [cdkDropListData]="placed()"
            [cdkDropListConnectedTo]="[palette]"
            (cdkDropListDropped)="drop($event)"
            class="flex min-h-64 flex-col rounded-lg bg-slate-50/40 p-2"
          >
            @for (row of rows(); track row.id) {
              <div cdkDrag class="flex items-stretch">
                @for (g of row.guides; track $index) {
                  <span class="guide" [class]="'guide-' + g"></span>
                }
                <div
                  class="node-chip my-1 flex flex-1 items-center gap-2 self-center rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm"
                >
                  <i cdkDragHandle class="pi pi-bars cursor-grab text-slate-300 active:cursor-grabbing"></i>
                  <i [class]="icon(row.kind)" class="text-violet-500"></i>
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm text-slate-700">{{ row.name }}</div>
                    <div class="truncate text-xs text-slate-400">
                      @if (row.parentName) {
                        ภายใต้: {{ row.parentName }}
                      } @else {
                        ระดับบนสุด
                      }
                    </div>
                  </div>
                  <button
                    type="button"
                    class="rounded p-1 text-slate-400 enabled:hover:bg-violet-50 enabled:hover:text-violet-600 disabled:opacity-25"
                    [disabled]="!row.canOutdent"
                    [attr.aria-label]="'เยื้องออก ' + row.name"
                    (click)="changeDepth($index, -1)"
                  >
                    <i class="pi pi-angle-left"></i>
                  </button>
                  <button
                    type="button"
                    class="rounded p-1 text-slate-400 enabled:hover:bg-violet-50 enabled:hover:text-violet-600 disabled:opacity-25"
                    [disabled]="!row.canIndent"
                    [attr.aria-label]="'เยื้องเข้า ' + row.name"
                    (click)="changeDepth($index, 1)"
                  >
                    <i class="pi pi-angle-right"></i>
                  </button>
                </div>
              </div>
            } @empty {
              <p class="m-auto py-12 text-sm text-slate-400">ลากมาวางที่นี่เพื่อเริ่มจัดกลุ่ม</p>
            }
          </div>
        </div>
      </div>
    </section>
  `,
  styles: `
    :host {
      --tree-line: #c4b5fd;
    }
    /* ช่องเยื้อง 1 ระดับ + เส้นโครงสร้าง */
    .guide {
      position: relative;
      width: 24px;
      flex: 0 0 24px;
    }
    .guide-line::before,
    .guide-tee::before,
    .guide-ell::before {
      content: '';
      position: absolute;
      left: 11px;
      top: 0;
      bottom: 0;
      border-left: 1.5px solid var(--tree-line);
    }
    /* └ : เส้นตั้งครึ่งบน */
    .guide-ell::before {
      bottom: auto;
      height: 50%;
    }
    /* ├ และ └ : แขนแนวนอนต่อไปยังการ์ด */
    .guide-tee::after,
    .guide-ell::after {
      content: '';
      position: absolute;
      left: 11px;
      right: 0;
      top: 50%;
      border-top: 1.5px solid var(--tree-line);
    }

    .cdk-drag-preview {
      box-shadow:
        0 5px 5px -3px rgb(0 0 0 / 0.2),
        0 8px 10px 1px rgb(0 0 0 / 0.14);
      border-radius: 0.5rem;
      opacity: 0.95;
    }
    .cdk-drag-placeholder {
      opacity: 0.4;
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
  protected readonly total = initialPlaced().length + initialPalette().length;

  protected readonly paletteItems = signal<OrgItem[]>(initialPalette());
  protected readonly placed = signal<OrgItem[]>(initialPlaced());

  /** มุมมองโซนขวา: เติมข้อมูลแม่/ปุ่ม/เส้นโครงสร้างให้แต่ละแถว */
  protected readonly rows = computed<PlacedRow[]>(() => {
    const list = this.placed();
    return list.map((item, i) => ({
      ...item,
      canOutdent: item.depth > 0,
      canIndent: i > 0 && item.depth <= list[i - 1].depth,
      parentName: this.findParentName(list, i),
      guides: this.buildGuides(list, i),
    }));
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
        // ลากไปทางขวา = เยื้องลึกขึ้น (เป็นลูก), ลากไปทางซ้าย = ตื้นขึ้น
        const delta = Math.round(event.distance.x / INDENT_PX);
        placed[event.currentIndex].depth += delta;
      }
    } else {
      const from = intoPlaced ? palette : placed;
      const to = intoPlaced ? placed : palette;
      transferArrayItem(from, to, event.previousIndex, event.currentIndex);
      if (intoPlaced) {
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
    this.placed.set(initialPlaced());
  }

  /** สร้างชนิดเส้นของแต่ละช่องเยื้องสำหรับแถว i */
  private buildGuides(list: OrgItem[], i: number): Guide[] {
    const depth = list[i].depth;
    const guides: Guide[] = [];
    for (let c = 0; c < depth; c++) {
      const t = c + 1;
      const cont = continuesAtDepth(list, i, t);
      if (c < depth - 1) {
        guides.push(cont ? 'line' : 'space');
      } else {
        guides.push(cont ? 'tee' : 'ell');
      }
    }
    return guides;
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
