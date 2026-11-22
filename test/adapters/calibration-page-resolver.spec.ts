import { expect, it } from 'vitest';

import { CalibrationPageResolver } from
  '../../src/adapters/outbound/capabilities/calibration/calibration-page-resolver.adapter.js';
import { CalibrationPageReferenceKind } from '../../src/domain/calibration/calibration-profile.js';
import { Page } from '../../src/domain/pages/page.js';
import { PublishedRouteKind } from '../../src/domain/publication/published-route.js';
import { BusinessErrorCode } from '../../src/domain/shared/business-error.js';
import { Site } from '../../src/domain/sites/site.js';
import { SiteOriginMode } from '../../src/domain/sites/site-origin-mode.enum.js';
import { calibrationProfile } from '../support/calibration.js';
import { pageFixture } from '../support/pages.js';
import { siteFixture } from '../support/sites.js';

const resolver = new CalibrationPageResolver(() => ({
  site: { execute: async () => siteFixture('one', 'One', 'one.test') },
  pages: { execute: async () => [new Page({ ...pageFixture('page', 'one').toState(), pageNumber: '12' })] },
  catalog: {
    execute: async () => ({
      siteId: 'one',
      urls: [],
      pages: [],
      published: {
        releaseId: 'release',
        sitemapPaths: [],
        routes: [{
          kind: PublishedRouteKind.Static,
          urlId: 'url',
          pageId: 'page',
          path: '/',
          documentPath: 'index.html',
        }],
      },
    }),
  },
}));

it('resolves relative URLs, registered absolute URLs and site-scoped numeric page identities', async () => {
  for (const [kind, reference] of [[CalibrationPageReferenceKind.RelativeUrl, '/'],
    [CalibrationPageReferenceKind.AbsoluteUrl, 'https://one.test/'], [CalibrationPageReferenceKind.PageNumber, '12']] as const) {
    const result = await resolver.resolve({
      ...calibrationProfile(),
      targets: [{
        siteId: 'one',
        kind,
        reference,
        share: 5000,
      }],
    }, 'valid');

    expect(result).toEqual([{
      siteId: 'one',
      authority: 'one.test',
      path: '/',
      share: 5000,
      effectiveShare: 100,
      releaseId: 'release',
    }]);
  }
});

it('retains a zero row in the profile but does not require its future page to be published for a run', async () => {
  const profile = calibrationProfile();
  const targets = [...profile.targets, {
    siteId: 'one',
    kind: CalibrationPageReferenceKind.PageNumber,
    reference: '999',
    share: 0,
  }];

  expect(await resolver.resolve({ ...profile, targets }, 'valid')).toHaveLength(1);
  expect(targets).toHaveLength(2);
});

it('rejects foreign URLs, administrative endpoints, unknown numeric IDs and wholly zero traffic', async () => {
  for (const [kind, reference, share] of [
    [CalibrationPageReferenceKind.AbsoluteUrl, 'https://foreign.test/', 10000],
    [CalibrationPageReferenceKind.RelativeUrl, '//foreign.test/', 10000],
    [CalibrationPageReferenceKind.RelativeUrl, '/api/admin/installation/resources', 10000],
    [CalibrationPageReferenceKind.PageNumber, '999', 10000],
    [CalibrationPageReferenceKind.RelativeUrl, '/', 0],
  ] as const) {
    await expect(resolver.resolve({ ...calibrationProfile(), targets: [{ siteId: 'one', kind, reference, share }] },
      'valid'))
      .rejects.toMatchObject({ code: BusinessErrorCode.Validation });
  }
});

it('resolves numeric 5 through the selected site’s published route and its local serving authority', async () => {
  const site = new Site({
    ...siteFixture('one', 'One', 'one.test').toState(),
    addresses: {
      originMode: SiteOriginMode.Local,
      localOrigin: 'http://localhost:3000',
      publicOrigin: 'https://one.test',
    },
  });
  const localResolver = new CalibrationPageResolver(() => ({
    site: { execute: async () => site },
    pages: {
      execute: async () => [
        new Page({ ...pageFixture('foreign-page', 'two').toState(), pageNumber: '5' }),
        new Page({ ...pageFixture('local-page', 'one').toState(), pageNumber: '5' }),
      ],
    },
    catalog: {
      execute: async () => ({
        siteId: 'one',
        urls: [],
        pages: [],
        published: {
          releaseId: 'active-release',
          sitemapPaths: [],
          routes: [{
            kind: PublishedRouteKind.Request,
            urlId: 'published-url',
            pageId: 'local-page',
            path: '/published-entry/',
            renderPlanId: 'plan',
          }],
        },
      }),
    },
  }));
  const targets = await localResolver.resolve({
    ...calibrationProfile(),
    targets: [{
      siteId: 'one', kind: CalibrationPageReferenceKind.PageNumber, reference: '5', share: 10000,
    }],
  }, 'valid');

  expect(targets[0]).toMatchObject({
    authority: 'localhost:3000',
    path: '/published-entry/',
    releaseId: 'active-release',
  });
  expect(new URL(targets[0]!.path, 'http://' + targets[0]!.authority).href)
    .toBe('http://localhost:3000/published-entry/');
});
