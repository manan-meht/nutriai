// The IFCT 2017 importer, on a synthetic fixture. Every value below is
// made up (111, 2.22 ...) and the foods are fictional: no IFCT data is in
// this repository until its licence is confirmed.

import { buildIndex, getFood, matchFood, nutrientPer100g } from "@/lib/nutrients/composition";
import { convertIfct, parseCsv, parseIfctValue } from "@/lib/nutrients/importers/ifct";
import { COMPOSITION_SOURCES } from "@/lib/nutrients/sources";

const FIXTURE = [
  "code,name,grup,enerc,protcnt,fatce,fibtg,choavldf,ca,fe,mg,k,zn,folsum,vitc,vitb12,retol,cartb,carta,crypxb,ergcal,chocal,id",
  'T001,"Testgrain, raw",A,1000,10,2,5,60,111,2.22,33,444,1.5,50,0,,0,120,24,24,0,0,',
  'T002,"Testleaf, fresh",C,100,3,0.5,2,4,222,Tr,ND,555,0.4,"80±5",30,,0,1200,,,,,',
  "T003,Testmilk,L,250,3.5,4,0,5,120,0.1,11,150,0.4,5,1,0.4,40,10,0,0,0.1,0.05,12",
].join("\n");

describe("parseIfctValue", () => {
  it("keeps blank and ND unknown, Tr trace, and takes the mean of mean±SD", () => {
    expect(parseIfctValue("")).toEqual({ kind: "unknown" });
    expect(parseIfctValue("ND")).toEqual({ kind: "unknown" });
    expect(parseIfctValue("-")).toEqual({ kind: "unknown" });
    expect(parseIfctValue("Tr")).toEqual({ kind: "trace" });
    expect(parseIfctValue("80±5")).toEqual({ kind: "value", v: 80 });
    expect(parseIfctValue("0")).toEqual({ kind: "value", v: 0 });
  });
});

describe("convertIfct", () => {
  const file = convertIfct(parseCsv(FIXTURE), {
    release: "2017",
    version: "ifct-test",
    aliases: { T001: { key: "testgrain_raw", aliases: ["testgrain"], state: "raw" }, T003: { aliases: ["testmilk"], state: "prepared" } },
  });
  const byCode = (c: string) => file.foods.find((f) => f.sourceCode === c)!;

  it("produces the shared source format", () => {
    expect(file.source.id).toBe("ifct");
    expect(file.foods).toHaveLength(3);
    expect(byCode("T001")).toMatchObject({ key: "testgrain_raw", id: "ifct:T001", dataset: "ifct2017", group: "grain", state: "raw", aliases: ["testgrain"] });
    // No curated aliases: kept, but only reachable by id.
    expect(byCode("T002").aliases).toEqual([]);
  });

  it("converts energy from kJ and makes carbs total by adding fibre", () => {
    expect(byCode("T001").per100g).toMatchObject({ energy: 239, carbs: 65, fiber: 5, protein: 10 });
  });

  it("never turns a blank or ND into 0", () => {
    const leaf = byCode("T002").per100g;
    expect(leaf).not.toHaveProperty("magnesium");
    expect(leaf.iron).toBe("trace");
    expect(byCode("T001").per100g).not.toHaveProperty("vitamin_b12");
    expect(byCode("T001").per100g).not.toHaveProperty("iodine");
    expect(byCode("T003").per100g.iodine).toBe(12);
  });

  it("computes vitamin A RAE only with all four components", () => {
    // 0 + 120/12 + (24+24)/24 = 12
    expect(byCode("T001").per100g.vitamin_a).toBe(12);
    // Testleaf lacks alpha-carotene and cryptoxanthin: unknown.
    expect(byCode("T002").per100g).not.toHaveProperty("vitamin_a");
    expect(byCode("T003").per100g).toMatchObject({ vitamin_a: 40.833, retinol: 40 });
  });

  it("treats total folates as DFE with no folic acid, and adds D2 + D3", () => {
    expect(byCode("T002").per100g).toMatchObject({ folate: 80, folic_acid: 0 });
    expect(byCode("T003").per100g.vitamin_d).toBe(0.15);
    expect(byCode("T002").per100g).not.toHaveProperty("vitamin_d");
  });

  it("is preferred over USDA once registered first", () => {
    const index = buildIndex([file, ...COMPOSITION_SOURCES]);
    const m = matchFood("testgrain", {}, index);
    expect(m.kind === "matched" && m.food.sourceId).toBe("ifct");
    expect(nutrientPer100g(getFood("ifct:T001", index)!, "calcium")).toEqual({ state: "value", amount: 111 });
    // USDA still answers what IFCT doesn't know.
    const dal = matchFood("dal", {}, index);
    expect(dal.kind === "matched" && dal.food.sourceId).toBe("usda-fdc");
  });
});
