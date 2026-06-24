/**
 * Unit tests for ommlToMathml — OMML (.docx native math) → MathML.
 */
import { describe, test, expect } from 'bun:test';
import { ommlToMathml } from './ommlToMathml';

/** Wrap OMML body in an <m:oMath> with the namespace declaration. */
function oMath(body: string, tag = 'm:oMath'): string {
  return `<${tag} xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math">${body}</${tag.split(' ')[0].replace(/^<?/, '')}>`;
}

function run(text: string): string {
  return `<m:r><m:t>${text}</m:t></m:r>`;
}

describe('ommlToMathml', () => {
  test('returns null for empty / unparseable input', () => {
    expect(ommlToMathml('')).toBeNull();
    expect(ommlToMathml('   ')).toBeNull();
    expect(ommlToMathml('<not xml')).toBeNull();
  });

  test('plain run → <math> with classified tokens', () => {
    const ml = ommlToMathml(oMath(run('x') + run('+') + run('1')));
    expect(ml).toContain('<math');
    expect(ml).toContain('xmlns="http://www.w3.org/1998/Math/MathML"');
    expect(ml).toContain('<mi>x</mi>');
    expect(ml).toContain('<mo>+</mo>');
    expect(ml).toContain('<mn>1</mn>');
  });

  test('fraction → <mfrac>', () => {
    const frac = `<m:f><m:num>${run('a')}</m:num><m:den>${run('b')}</m:den></m:f>`;
    const ml = ommlToMathml(oMath(frac))!;
    expect(ml).toContain('<mfrac>');
    expect(ml).toContain('<mi>a</mi>');
    expect(ml).toContain('<mi>b</mi>');
  });

  test('superscript → <msup>', () => {
    const sup = `<m:sSup><m:e>${run('x')}</m:e><m:sup>${run('2')}</m:sup></m:sSup>`;
    const ml = ommlToMathml(oMath(sup))!;
    expect(ml).toContain('<msup>');
    expect(ml).toContain('<mn>2</mn>');
  });

  test('subscript → <msub>', () => {
    const sub = `<m:sSub><m:e>${run('a')}</m:e><m:sub>${run('i')}</m:sub></m:sSub>`;
    const ml = ommlToMathml(oMath(sub))!;
    expect(ml).toContain('<msub>');
  });

  test('square root (empty degree) → <msqrt>', () => {
    const rad = `<m:rad><m:deg/><m:e>${run('x')}</m:e></m:rad>`;
    const ml = ommlToMathml(oMath(rad))!;
    expect(ml).toContain('<msqrt>');
    expect(ml).not.toContain('<mroot>');
  });

  test('nth root (with degree) → <mroot>', () => {
    const rad = `<m:rad><m:deg>${run('3')}</m:deg><m:e>${run('x')}</m:e></m:rad>`;
    const ml = ommlToMathml(oMath(rad))!;
    expect(ml).toContain('<mroot>');
  });

  test('delimiter → fences', () => {
    const d = `<m:d><m:e>${run('x')}</m:e></m:d>`;
    const ml = ommlToMathml(oMath(d))!;
    expect(ml).toContain('<mo>(</mo>');
    expect(ml).toContain('<mo>)</mo>');
  });

  test('n-ary (sum with bounds) → <msubsup> over the operator', () => {
    const nary = `<m:nary><m:naryPr><m:chr m:val="∑"/></m:naryPr><m:sub>${run('i')}</m:sub><m:sup>${run('n')}</m:sup><m:e>${run('i')}</m:e></m:nary>`;
    const ml = ommlToMathml(oMath(nary))!;
    expect(ml).toContain('<msubsup>');
    expect(ml).toContain('∑');
  });

  test('oMathPara → display="block"', () => {
    const ml = ommlToMathml(oMath(run('x'), 'm:oMathPara'))!;
    expect(ml).toContain('display="block"');
  });

  test('inline oMath → display="inline"', () => {
    const ml = ommlToMathml(oMath(run('x')))!;
    expect(ml).toContain('display="inline"');
  });

  test('matrix → <mtable> with rows and cells', () => {
    const m = `<m:m><m:mr><m:e>${run('a')}</m:e><m:e>${run('b')}</m:e></m:mr><m:mr><m:e>${run('c')}</m:e><m:e>${run('d')}</m:e></m:mr></m:m>`;
    const ml = ommlToMathml(oMath(m))!;
    expect(ml).toContain('<mtable>');
    expect((ml.match(/<mtr>/g) ?? []).length).toBe(2);
    expect((ml.match(/<mtd>/g) ?? []).length).toBe(4);
  });

  test('special XML chars in text round-trip escaped', () => {
    // OMML text arrives already XML-escaped; the output must stay escaped.
    const ml = ommlToMathml(oMath(run('a&lt;b')))!;
    expect(ml).toContain('&lt;');
    expect(ml).not.toMatch(/a<b/);
  });
});
