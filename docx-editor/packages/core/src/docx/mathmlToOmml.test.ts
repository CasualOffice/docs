/**
 * Unit tests for mathmlToOmml + a round-trip through ommlToMathml.
 */
import { describe, test, expect } from 'bun:test';
import { mathmlToOmml } from './mathmlToOmml';
import { ommlToMathml } from './ommlToMathml';

const NS = 'http://www.w3.org/1998/Math/MathML';
function math(body: string, display = 'inline'): string {
  return `<math xmlns="${NS}" display="${display}">${body}</math>`;
}

describe('mathmlToOmml', () => {
  test('null for empty / unparseable', () => {
    expect(mathmlToOmml('')).toBeNull();
    expect(mathmlToOmml('<not')).toBeNull();
  });

  test('tokens → runs inside <m:oMath>', () => {
    const omml = mathmlToOmml(math('<mi>x</mi><mo>+</mo><mn>1</mn>'))!;
    expect(omml).toContain('<m:oMath');
    expect(omml).toContain('<m:t>x</m:t>');
    expect(omml).toContain('<m:t>+</m:t>');
    expect(omml).toContain('<m:t>1</m:t>');
  });

  test('fraction → <m:f>', () => {
    const omml = mathmlToOmml(math('<mfrac><mi>a</mi><mi>b</mi></mfrac>'))!;
    expect(omml).toContain('<m:f>');
    expect(omml).toContain('<m:num>');
    expect(omml).toContain('<m:den>');
  });

  test('superscript → <m:sSup>', () => {
    const omml = mathmlToOmml(math('<msup><mi>x</mi><mn>2</mn></msup>'))!;
    expect(omml).toContain('<m:sSup>');
    expect(omml).toContain('<m:sup>');
  });

  test('square root → <m:rad> with hidden degree', () => {
    const omml = mathmlToOmml(math('<msqrt><mi>x</mi></msqrt>'))!;
    expect(omml).toContain('<m:rad>');
    expect(omml).toContain('m:degHide');
  });

  test('nth root → <m:rad> with degree', () => {
    const omml = mathmlToOmml(math('<mroot><mi>x</mi><mn>3</mn></mroot>'))!;
    expect(omml).toContain('<m:rad>');
    expect(omml).toContain('<m:deg>');
    expect(omml).not.toContain('degHide');
  });

  test('block display → <m:oMathPara>', () => {
    const omml = mathmlToOmml(math('<mi>x</mi>', 'block'))!;
    expect(omml).toContain('<m:oMathPara');
    expect(omml).toContain('<m:oMath');
  });

  test('matrix → <m:m> with rows + cells', () => {
    const ml = math('<mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr></mtable>');
    const omml = mathmlToOmml(ml)!;
    expect(omml).toContain('<m:m>');
    expect(omml).toContain('<m:mr>');
    expect((omml.match(/<m:e>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test('XML special chars escaped', () => {
    const omml = mathmlToOmml(math('<mo>&lt;</mo>'))!;
    expect(omml).toContain('&lt;');
  });

  test('unwraps KaTeX <semantics>/<annotation> wrapper', () => {
    // KaTeX wraps presentation MathML in <semantics> with a LaTeX
    // <annotation> sibling — the converter must use the presentation child
    // and drop the annotation.
    const katexLike = math(
      '<semantics><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac></mrow><annotation encoding="application/x-tex">\\frac{a}{b}</annotation></semantics>'
    );
    const omml = mathmlToOmml(katexLike)!;
    expect(omml).toContain('<m:f>');
    expect(omml).toContain('<m:t>a</m:t>');
    expect(omml).not.toContain('x-tex');
    expect(omml).not.toContain('frac{a}{b}');
  });

  // The two converters are inverses for the common structures: an authored
  // equation (MathML) → OMML → back to MathML preserves the structure.
  test('round-trips structure through ommlToMathml', () => {
    const original = math('<mfrac><msup><mi>x</mi><mn>2</mn></msup><mi>y</mi></mfrac>');
    const omml = mathmlToOmml(original)!;
    const back = ommlToMathml(omml)!;
    expect(back).toContain('<mfrac>');
    expect(back).toContain('<msup>');
    expect(back).toContain('<mi>x</mi>');
    expect(back).toContain('<mn>2</mn>');
    expect(back).toContain('<mi>y</mi>');
  });
});
