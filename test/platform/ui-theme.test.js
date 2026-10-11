import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_THEME,resolveTheme,assertThemeContrast } from "../../src/platform/ui-theme.js";

test("global theme provides strict light and dark semantic tokens",()=>{
  const light=resolveTheme({mode:"light"});
  const dark=resolveTheme({mode:"dark"});
  assert.equal(light.brand.primary,"#123B6D");
  assert.equal(light.brand.accent,"#D9E85B");
  assert.notEqual(light.text,light.background);
  assert.notEqual(dark.text,dark.background);
  assertThemeContrast(light);
  assertThemeContrast(dark);
  assert.deepEqual(DEFAULT_THEME.brand,{primary:"#123B6D",accent:"#D9E85B"});
});
