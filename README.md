# Demo: Sortable Org Tree (POC)

POC สำหรับฟีเจอร์ **จัดลำดับขั้น/ผังองค์กรแบบลากวาง** — ลากหน่วยงานจาก "คลัง" ด้านซ้าย
มาวางใน "โซนจัดผัง" ด้านขวา แล้วลากเยื้องเพื่อกำหนดความสัมพันธ์แม่–ลูก (รองรับการซ้อนหลายชั้นไม่จำกัด)

> เป้าหมายของ POC: พิสูจน์ว่าแนวทางลากวางนี้ทำงานได้จริงและนำไปประกอบกับโปรเจกต์หลัก
> (PrimeNG / UltimaNG) ได้ — **ไม่ได้เน้นความสวยของ UI**

## ทำอะไรได้บ้าง

- ลากหน่วยงานจากคลัง (ซ้าย) → โซนจัดผัง (ขวา) และลากกลับเพื่อเอาออก
- **ลากไปทางขวา = เป็นลูก** / **ลากไปทางซ้าย = เลื่อนขึ้นเป็นแม่**
- ปุ่ม ◂ / ▸ ปรับระดับ **ทั้งกิ่ง** (พร้อมลูกหลาน) — ทางเลือกเพิ่มเติมและช่วยเรื่อง accessibility
- ลากสลับลำดับภายในโซนขวา
- **ซ้อนเป็นลูกได้ไม่จำกัดชั้น** (จำกัดเพียงว่าแต่ละแถวลึกได้ทีละ 1 ระดับเทียบกับแถวเหนือมัน
  เพื่อให้เป็นโครงต้นไม้ที่ถูกต้อง)
- ปุ่มคืนค่าเริ่มต้น + ตัวนับจำนวนที่จัดแล้ว

## เทคโนโลยีที่ใช้

| Library | ใช้ทำอะไร |
|---|---|
| **Angular 21** (standalone + signals) | framework หลัก |
| **@angular/cdk** — Drag & Drop | **หัวใจของการลากวาง** (`cdkDropList`, `cdkDrag`, `moveItemInArray`, `transferArrayItem`) |
| **PrimeNG 21** + **@primeuix/themes** (Aura) | ปุ่ม (`p-button`) + ระบบธีม |
| **PrimeIcons** | ไอคอน (`pi pi-sitemap`, `pi pi-users`, ลูกศรเยื้อง ฯลฯ) |
| **Tailwind CSS 4** | จัด layout / สไตล์ |

> หมายเหตุ: เริ่มแรกลองใช้ **PrimeNG Tree** ก่อน แต่การลากไม่ลื่นและดึงลูกออกมาเป็น root ไม่ได้
> จึงเปลี่ยนมาใช้ **Angular CDK** ซึ่งคุมพฤติกรรมการลากได้เองทั้งหมด ส่วน PrimeNG ใช้แค่ปุ่ม/ธีม

## วิธีรัน

```bash
npm install
npm start
```

เปิด `http://localhost:4200`

```bash
npm run build   # production build
npm test        # unit test (vitest)
```

## แนวคิด/กลไกหลัก

ใช้ **flat list + ค่า `depth`** แทนการเก็บโครงสร้าง tree ซ้อนจริง — เป็นกุญแจที่ทำให้ลากง่ายและซ้อนได้ไม่จำกัด:

```
[ ฝ่าย A      depth 0 ]   ← root
[ ฝ่าย B      depth 1 ]   ← ลูกของ A
[ แผนก C      depth 2 ]   ← หลาน (ลูกของ B)
```

- **2 โซนเชื่อมกันด้วย** `[cdkDropListConnectedTo]` → ลากข้ามซ้าย–ขวา (`transferArrayItem`)
  และลากสลับลำดับในโซนเดียวกัน (`moveItemInArray`)
- **ลากขวา = เป็นลูก** → อ่านระยะลากแนวนอน `event.distance.x` หารด้วยระยะเยื้องต่อระดับ
  (`INDENT_PX`) ได้จำนวนชั้นที่จะเยื้อง แล้วบวกเข้า `depth`
- **แม่ของแต่ละแถว** = แถวก่อนหน้าที่ใกล้สุดซึ่ง `depth` ตื้นกว่า 1 ระดับ (ไม่ได้เก็บ `parentId` ตรงๆ)
- **`normalizeDepths()`** คุมความถูกต้องทุกครั้งหลังลาก: แถวแรกต้อง `depth = 0`
  และห้ามแถวใดลึกเกิน "แถวบน + 1" → กันการกระโดดข้ามชั้น แต่ไม่จำกัดความลึกรวม
- จัดการ state ด้วย **Angular signals** (`signal` / `computed`) + `ChangeDetectionStrategy.OnPush`

## โครงสร้างไฟล์ที่เกี่ยวข้อง

```
src/
├─ app/
│  ├─ org-tree/
│  │  └─ org-tree.ts      # component หลัก (logic + template + style รวมในไฟล์เดียว)
│  ├─ app.config.ts       # ลงทะเบียน providePrimeNG + theme preset (Aura)
│  ├─ app.ts / app.html   # mount <app-org-tree />
└─ styles.css             # import 'primeicons' + tailwind
```

## การนำไปใช้กับโปรเจกต์หลัก (UltimaNG)

- **Drag-drop logic (CDK)** ย้ายไปได้เลย ไม่ผูกกับธีม และ `@angular/cdk` มากับ PrimeNG อยู่แล้ว
- **`p-button` / PrimeIcons** รับสไตล์จาก preset ของ Ultima เองอัตโนมัติ
- **สี/สไตล์ที่เป็น Tailwind classes** ต้องปรับ — แนะนำเปลี่ยนไปใช้ PrimeNG design tokens
  (`--p-primary-color`, `--p-content-*`, `--p-text-*`) เพื่อให้กลมกลืนกับธีม
  หรือถ้าโปรเจกต์หลักไม่ได้เปิด Tailwind ให้แปลงเป็น CSS/SCSS ปกติ

---

POC นี้สร้างขึ้นเพื่อประเมินความเป็นไปได้ของฟีเจอร์ก่อนนำไป implement จริง
