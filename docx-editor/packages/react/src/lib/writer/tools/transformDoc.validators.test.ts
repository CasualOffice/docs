/*
 * Copyright (c) 2026 Casual Office. All rights reserved.
 */

// Pure-function tests for the six per-target semantic validators
// shipped in 4664eb2. Each validator runs against:
//
//   - a "clean" fixture that should produce zero issues (so the
//     happy path doesn't regress into noise)
//   - one or more "broken" fixtures where exactly one rule is
//     violated (so a future change to that rule shows up as a
//     specific test failure, not a vague "fewer issues than
//     before")
//
// These hit the validator directly — no LLM, no schema, no fragment
// builder. validateAndRetry.test.ts already exercises the retry loop.

import { describe, expect, it } from 'bun:test';
import {
  academicSemanticValidator,
  blogSemanticValidator,
  coverLetterSemanticValidator,
  memoSemanticValidator,
  resumeSemanticValidator,
  slideDeckSemanticValidator,
  type AcademicJson,
  type BlogJson,
  type CoverLetterJson,
  type MemoJson,
  type ResumeJson,
  type SlideDeckJson,
} from './transformDoc';

const cleanResume: ResumeJson = {
  name: 'Jane Smith',
  summary:
    'Senior backend engineer with eight years building distributed systems and a track record of mentoring teams of five.',
  experience: [
    {
      role: 'Staff Engineer',
      company: 'Acme',
      dates: '2022-present',
      bullets: ['Led migration of billing pipeline to event-sourced design.'],
    },
  ],
  skills: ['Go', 'Kafka'],
};

describe('resumeSemanticValidator', () => {
  it('returns no issues for a complete resume', () => {
    expect(resumeSemanticValidator(cleanResume)).toEqual([]);
  });

  it('flags an empty experience array', () => {
    const out = resumeSemanticValidator({ ...cleanResume, experience: [] });
    expect(out.some((i) => i.field === 'experience')).toBe(true);
  });

  it('flags a role with no bullets', () => {
    const out = resumeSemanticValidator({
      ...cleanResume,
      experience: [{ role: 'Staff Engineer', bullets: [] }],
    });
    expect(out.some((i) => i.field === 'experience[0].bullets')).toBe(true);
  });

  it('flags a bullet that does not start with an action verb', () => {
    const out = resumeSemanticValidator({
      ...cleanResume,
      experience: [{ role: 'Staff Engineer', bullets: ['Was responsible for billing pipeline.'] }],
    });
    expect(out.some((i) => /action verb/.test(i.reason))).toBe(true);
  });

  it('passes a bullet that does start with an action verb', () => {
    const out = resumeSemanticValidator({
      ...cleanResume,
      experience: [{ role: 'Staff Engineer', bullets: ['Shipped a 3x throughput rewrite.'] }],
    });
    expect(out.some((i) => /action verb/.test(i.reason))).toBe(false);
  });

  it('flags a summary shorter than 40 chars', () => {
    const out = resumeSemanticValidator({ ...cleanResume, summary: 'Short.' });
    expect(out.some((i) => i.field === 'summary')).toBe(true);
  });
});

const cleanCoverLetter: CoverLetterJson = {
  recipient: { name: 'Pat Lee', company: 'Acme' },
  opening:
    'Last year I migrated a 50M-row billing table without an outage, and your platform job is exactly that work.',
  body: [
    'I have spent the last three years owning data infrastructure at a 200-engineer company, with concrete results on cost and reliability that I would be glad to walk you through.',
  ],
  signOff: 'Sincerely,',
  signature: 'Jane Smith',
};

describe('coverLetterSemanticValidator', () => {
  it('returns no issues for a clean letter', () => {
    expect(coverLetterSemanticValidator(cleanCoverLetter)).toEqual([]);
  });

  it('flags an empty body array', () => {
    const out = coverLetterSemanticValidator({ ...cleanCoverLetter, body: [] });
    expect(out.some((i) => i.field === 'body')).toBe(true);
  });

  it('flags a body paragraph shorter than 40 chars', () => {
    const out = coverLetterSemanticValidator({ ...cleanCoverLetter, body: ['Too short.'] });
    expect(out.some((i) => i.field === 'body[0]' && /short/.test(i.reason))).toBe(true);
  });

  it('flags resume clichés in body', () => {
    const out = coverLetterSemanticValidator({
      ...cleanCoverLetter,
      body: [
        'I am a results-oriented self-starter who is passionate about delivering value to dynamic team players in the industry.',
      ],
    });
    expect(out.some((i) => /cliché/.test(i.reason))).toBe(true);
  });

  it('flags clichés in the opening', () => {
    const out = coverLetterSemanticValidator({
      ...cleanCoverLetter,
      opening:
        'I am a rockstar engineer who can hit the ground running and synergize with your dynamic team.',
    });
    expect(out.some((i) => i.field === 'opening' && /cliché/.test(i.reason))).toBe(true);
  });
});

const cleanMemo: MemoJson = {
  subject: 'Q3 incident review timeline',
  sections: [
    {
      heading: 'Background',
      body: 'Two production incidents this quarter affected billing for under 90 minutes total.',
    },
  ],
};

describe('memoSemanticValidator', () => {
  it('returns no issues for a clean memo', () => {
    expect(memoSemanticValidator(cleanMemo)).toEqual([]);
  });

  it('flags subjects ending in terminal punctuation', () => {
    const out = memoSemanticValidator({ ...cleanMemo, subject: 'Q3 incident review timeline.' });
    expect(out.some((i) => i.field === 'subject' && /terminal punctuation/.test(i.reason))).toBe(
      true
    );
  });

  it('flags subjects longer than 80 chars', () => {
    const out = memoSemanticValidator({
      ...cleanMemo,
      subject: 'A'.repeat(81),
    });
    expect(out.some((i) => i.field === 'subject' && /80/.test(i.reason))).toBe(true);
  });

  it('flags an empty sections array', () => {
    const out = memoSemanticValidator({ ...cleanMemo, sections: [] });
    expect(out.some((i) => i.field === 'sections')).toBe(true);
  });

  it('flags section bodies shorter than 30 chars', () => {
    const out = memoSemanticValidator({
      ...cleanMemo,
      sections: [{ heading: 'Background', body: 'Too short.' }],
    });
    expect(out.some((i) => i.field === 'sections[0].body')).toBe(true);
  });
});

const cleanBlog: BlogJson = {
  title: 'What we learned shipping event-sourcing without an outage',
  intro: 'Five engineers, two databases, one weekend window — here is what actually mattered.',
  sections: [
    { heading: 'The bet', body: 'We moved 50M rows of billing data live.' },
    { heading: 'The rollback we never used', body: 'A backup branch sat warm for 72 hours.' },
  ],
};

describe('blogSemanticValidator', () => {
  it('returns no issues for a clean post', () => {
    expect(blogSemanticValidator(cleanBlog)).toEqual([]);
  });

  it('flags an empty title', () => {
    const out = blogSemanticValidator({ ...cleanBlog, title: '' });
    expect(out.some((i) => i.field === 'title')).toBe(true);
  });

  it('flags fewer than 2 sections', () => {
    const out = blogSemanticValidator({ ...cleanBlog, sections: [cleanBlog.sections![0]] });
    expect(out.some((i) => i.field === 'sections')).toBe(true);
  });

  it('flags filler-cliché intros', () => {
    const out = blogSemanticValidator({
      ...cleanBlog,
      intro: "In today's fast-paced world, let's dive in to what really matters.",
    });
    expect(out.some((i) => i.field === 'intro')).toBe(true);
  });
});

const cleanAcademic: AcademicJson = {
  title: 'Latency under load: an empirical study of event-sourced billing',
  abstract:
    'We present a measurement study of event-sourced billing systems under sustained write pressure, demonstrating that p99 latency scales sub-linearly with queue depth across three production deployments.',
  sections: [
    { heading: 'Methods', body: 'We instrumented 12 weeks of production traffic.' },
    { heading: 'Results', body: 'Latency degraded gracefully past the design ceiling.' },
  ],
  references: [{ author: 'Smith, J.', title: 'Event sourcing patterns', year: '2024' }],
};

describe('academicSemanticValidator', () => {
  it('returns no issues for a clean paper', () => {
    expect(academicSemanticValidator(cleanAcademic)).toEqual([]);
  });

  it('flags an abstract shorter than 80 chars', () => {
    const out = academicSemanticValidator({ ...cleanAcademic, abstract: 'Too brief.' });
    expect(out.some((i) => i.field === 'abstract')).toBe(true);
  });

  it('flags fewer than 2 sections', () => {
    const out = academicSemanticValidator({
      ...cleanAcademic,
      sections: [cleanAcademic.sections![0]],
    });
    expect(out.some((i) => i.field === 'sections')).toBe(true);
  });

  it('flags non-4-digit years in references', () => {
    const out = academicSemanticValidator({
      ...cleanAcademic,
      references: [{ author: 'Smith, J.', title: 'Stuff', year: 'twenty twenty-four' }],
    });
    expect(out.some((i) => i.field === 'references[0].year')).toBe(true);
  });
});

const cleanSlideDeck: SlideDeckJson = {
  title: 'Migrating billing to event sourcing',
  slides: [
    { title: 'Why', bullets: ['Throughput floor too low'] },
    { title: 'How', bullets: ['Dual-write then cutover'] },
    { title: 'What we learned', bullets: ['Rollback budget was cheap'] },
  ],
};

describe('slideDeckSemanticValidator', () => {
  it('returns no issues for a 3-slide deck', () => {
    expect(slideDeckSemanticValidator(cleanSlideDeck)).toEqual([]);
  });

  it('flags decks with fewer than 3 slides', () => {
    const out = slideDeckSemanticValidator({
      ...cleanSlideDeck,
      slides: cleanSlideDeck.slides!.slice(0, 2),
    });
    expect(out.some((i) => i.field === 'slides')).toBe(true);
  });

  it('flags slides with empty titles', () => {
    const out = slideDeckSemanticValidator({
      ...cleanSlideDeck,
      slides: [
        { title: '', bullets: ['x'] },
        { title: 'How', bullets: ['y'] },
        { title: 'What', bullets: ['z'] },
      ],
    });
    expect(out.some((i) => i.field === 'slides[0].title')).toBe(true);
  });
});
