import { describe, expect, it } from 'bun:test';

import {
  LocalityRepositoryImpl,
  localityRepository,
  validateLocalityDataEnvelope,
  type AnitabiSceneProjector,
  type LocalityDataLoader,
  type Place,
  type PlaceId,
  type PlaceRole,
  type RoleId,
  type SceneRole,
} from '../../../libs/services/pilgrimage/locality';

describe('canonical locality migration', () => {
  it('PILG-053 conserves every bundled locality record and membership', () => {
    const { entities } = localityRepository.getSnapshot();
    const roles = Object.values(entities.roles);
    const events = Object.values(entities.events);
    const areas = Object.values(entities.areaDestinations);

    expect(Object.keys(entities.places)).toHaveLength(203);
    expect(roles).toHaveLength(209);
    expect(events).toHaveLength(9);
    expect(events.filter((event) => event.category === 'stamp_rally')).toHaveLength(7);
    expect(roles.filter((role) => role.kind === 'stamp_stop')).toHaveLength(201);
    expect(areas).toHaveLength(124);
    expect(Object.keys(entities.placeGuides)).toHaveLength(1);
    expect(Object.keys(entities.newsSources)).toHaveLength(17);
    expect(areas.every((area) => !('geo' in area) && area.placeRefs.length === 0)).toBe(true);

    const originalIds = new Set([
      ...roles.filter((role) => role.kind === 'shop').map((role) => role.placeId as string),
      ...events
        .filter((event) =>
          [
            'yuwaku-bonbori-matsuri',
            'yuwaku-bonbori-lighting-2026',
            'numazu-machiaruki-stamp',
          ].includes(event.id)
        )
        .map((event) => event.id as string),
      ...Object.values(entities.placeGuides).map((guide) => guide.id as string),
    ]);
    expect([...originalIds].sort()).toEqual(
      [
        'awashima-hotel',
        'bentenjima-torii-sunset',
        'gamers-numazu',
        'kaishunro',
        'kifune-shoten',
        'numazu-machiaruki-stamp',
        'shizuhana',
        'shougetsu',
        'yasudaya-ryokan',
        'yuwaku-bonbori-lighting-2026',
        'yuwaku-bonbori-matsuri',
      ].sort()
    );

    const allEntities = [
      ...Object.values(entities.places),
      ...roles,
      ...events,
      ...areas,
      ...Object.values(entities.placeGuides),
      ...Object.values(entities.newsSources),
    ];
    for (const entity of allEntities) {
      expect(entity.provenance[0].sourceName.ja.length).toBeGreaterThan(0);
      expect(entity.provenance[0].verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(entity.provenance[0].copyrightNotice?.ja.length).toBeGreaterThan(0);
    }
  });

  it('PILG-054 resolves Gamers Numazu to one Place with four roles and every source', () => {
    const placeId = 'gamers-numazu' as PlaceId;
    const place = localityRepository.getPlaceById(placeId);
    const roles = localityRepository.getRolesForPlace(placeId);

    expect(place?.geo).toEqual([35.101505, 138.856827]);
    expect(place?.address).toEqual({ ja: '静岡県沼津市添地町72 青秀ビル1階' });
    expect(roles.map((role) => role.kind)).toEqual([
      'shop',
      'stamp_stop',
      'stamp_stop',
      'stamp_stop',
    ]);
    expect(place?.provenance.map((credit) => credit.sourceUrl)).toEqual([
      'https://www.gamers.co.jp/shop/detail.php?id=11',
      'https://www.llsunshine-numazu.jp/worldwide/index.html',
      'https://recommend.jr-central.co.jp/oshi-tabi/lovelive_sunshine/stamprally/',
      'https://recommend.jr-central.co.jp/oshi-tabi/yohane/',
    ]);
  });

  it('PILG-054 rejects a role anime link that its Place does not carry', () => {
    const invalid = structuredClone(localityRepository.getSnapshot());
    const roles = invalid.entities.roles as unknown as Record<RoleId, PlaceRole>;
    const role = roles['shop:gamers-numazu' as RoleId];
    if (!role) throw new Error('fixture role missing');
    roles[role.id] = { ...role, animeIds: [999999] };

    expect(() => validateLocalityDataEnvelope(invalid)).toThrow(
      'role shop:gamers-numazu animeId 999999 is missing from place gamers-numazu'
    );
  });

  it('PILG-054 keeps the last valid snapshot when refresh validation fails', async () => {
    const initial = localityRepository.getSnapshot();
    const invalid = structuredClone(initial);
    const roles = invalid.entities.roles as unknown as Record<RoleId, PlaceRole>;
    const role = roles['shop:gamers-numazu' as RoleId];
    if (!role) throw new Error('fixture role missing');
    roles[role.id] = { ...role, animeIds: [999999] };
    const loader: LocalityDataLoader = {
      id: 'invalid-refresh-fixture',
      loadInitial: () => initial,
      loadLatest: async () => invalid,
    };
    const repository = new LocalityRepositoryImpl(loader);
    let notifications = 0;
    repository.subscribe(() => {
      notifications += 1;
    });

    await expect(repository.refresh()).rejects.toThrow('animeId 999999');
    expect(repository.getSnapshot()).toBe(initial);
    expect(notifications).toBe(0);
  });

  it('PILG-055 joins canonical event Places with projected scenes without mutating the bundle', async () => {
    const initial = localityRepository.getSnapshot();
    const scenePlace: Place = {
      id: 'anitabi:165553:scene-fixture' as PlaceId,
      name: { ja: 'Scene fixture' },
      geo: [35.1, 138.8],
      animeIds: [165553],
      provenance: initial.entities.places['gamers-numazu' as PlaceId].provenance,
    };
    const sceneRole: SceneRole = {
      id: 'scene:anitabi:165553:scene-fixture' as RoleId,
      kind: 'scene',
      placeId: scenePlace.id,
      animeIds: [165553],
      anitabiRef: { bangumiId: 165553, pointId: 'scene-fixture' },
      provenance: scenePlace.provenance,
    };
    const projector: AnitabiSceneProjector = {
      getScenePlacesForAnime: async () => ({ places: [scenePlace], roles: [sceneRole] }),
    };
    const repository = new LocalityRepositoryImpl(
      {
        id: 'overlay-fixture',
        loadInitial: () => initial,
        loadLatest: async () => initial,
      },
      projector
    );

    const rows = await repository.getPlacesForAnime(165553);
    const gamers = rows.find((row) => row.place.id === ('gamers-numazu' as PlaceId));

    expect(gamers?.roles.map((role) => role.kind)).toEqual([
      'shop',
      'stamp_stop',
      'stamp_stop',
      'stamp_stop',
    ]);
    expect(rows.some((row) => row.place.id === scenePlace.id)).toBe(true);
    expect(
      Object.values(repository.getSnapshot().entities.roles).some((role) => role.kind === 'scene')
    ).toBe(false);
  });
});
