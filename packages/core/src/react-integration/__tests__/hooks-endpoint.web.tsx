import {
  CoolerArticleResource,
  PaginatedArticleResource,
  ArticleResourceWithOtherListUrl,
  StaticArticleResource,
} from '__tests__/new';
import React, { Suspense, useEffect } from 'react';
import { render } from '@testing-library/react';
import { renderHook } from '@testing-library/react-hooks';
import nock from 'nock';

// relative imports to avoid circular dependency in tsconfig references
import { Endpoint } from '@rest-hooks/endpoint';

import {
  makeRenderRestHook,
  makeCacheProvider,
  mockInitialState,
} from '../../../../test';
import { DispatchContext, StateContext } from '../context';
import {
  useFetcher,
  useRetrieve,
  useInvalidator,
  useResetter,
  useResource,
} from '../hooks';
import { initialState } from '../../state/reducer';
import { State, ActionTypes } from '../../types';
import { INVALIDATE_TYPE, RESET_TYPE } from '../../actionTypes';
import { users, articlesPages, payload } from '../test-fixtures';

async function testDispatchFetch(
  Component: React.FunctionComponent<any>,
  payloads: any[],
) {
  const dispatch = jest.fn();
  const tree = (
    <DispatchContext.Provider value={dispatch}>
      <Suspense fallback={null}>
        <Component />
      </Suspense>
    </DispatchContext.Provider>
  );
  render(tree);
  expect(dispatch).toHaveBeenCalledTimes(payloads.length);
  let i = 0;
  for (const call of dispatch.mock.calls) {
    expect(call[0]).toMatchSnapshot();
    const action = call[0];
    const res = await action.payload();
    expect(res).toEqual(payloads[i]);
    i++;
  }
}

function testRestHook(
  callback: () => void,
  state: State<unknown>,
  dispatch = (v: ActionTypes) => Promise.resolve(),
) {
  return renderHook(callback, {
    wrapper: function Wrapper({ children }) {
      return (
        <DispatchContext.Provider value={dispatch}>
          <StateContext.Provider value={state}>
            {children}
          </StateContext.Provider>
        </DispatchContext.Provider>
      );
    },
  });
}

let mynock: nock.Scope;

beforeAll(() => {
  nock(/.*/)
    .persist()
    .defaultReplyHeaders({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    })
    .options(/.*/)
    .reply(200);
  mynock = nock(/.*/).defaultReplyHeaders({
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  });
});

afterAll(() => {
  nock.cleanAll();
});

describe('useFetcher', () => {
  const payload = { id: 1, content: 'hi' };

  it('should dispatch an action that fetches a create', async () => {
    mynock.post(`/article-cooler/`).reply(201, payload);

    function DispatchTester() {
      const a = useFetcher(CoolerArticleResource.create());
      a({}, { content: 'hi' }).then(v => {
        v.author;
        //@ts-expect-error
        v.jasfdasdf;
      });
      return null;
    }
    await testDispatchFetch(DispatchTester, [payload]);
  });

  it('should dispatch an action with updater in the meta if update shapes params are passed in', async () => {
    mynock.post(`/article-cooler/`).reply(201, payload);

    function DispatchTester() {
      const create = useFetcher(CoolerArticleResource.create());
      const params = { content: 'hi' };
      create({}, params, [
        [
          CoolerArticleResource.list(),
          {},
          (article: any, articles: any) => [...articles, article],
        ],
      ]).then(v => {
        v.title;
        // @ts-expect-error
        v.doesnotexist;
      });
      return null;
    }
    await testDispatchFetch(DispatchTester, [payload]);
  });

  it('should refresh get details', async () => {
    mynock.get(`/article-cooler/${payload.id}`).reply(200, payload);

    function DispatchTester() {
      const refresh = useFetcher(CoolerArticleResource.detail());
      // @ts-expect-error
      () => refresh({}, { content: 'hi' });
      refresh({ id: payload.id }).then(v => {
        v.title;
        // @ts-expect-error
        v.doesnotexist;
      });
      return null;
    }
    await testDispatchFetch(DispatchTester, [payload]);
  });

  it('should dispatch an action with multiple updaters in the meta if update shapes params are passed in', async () => {
    mynock.post(`/article/`).reply(201, payload);

    function DispatchTester() {
      const create = useFetcher(ArticleResourceWithOtherListUrl.create());
      const params = { content: 'hi' };
      create({}, params, [
        [
          ArticleResourceWithOtherListUrl.list(),
          {},
          (article: any, articles: any) => [...articles, article],
        ],
        [
          ArticleResourceWithOtherListUrl.otherList(),
          {},
          (article: any, articles: any) => [...articles, article],
        ],
      ]);
      return null;
    }
    await testDispatchFetch(DispatchTester, [payload]);
  });

  it('should console.error() a warning when fetching without a Provider', () => {
    const oldError = console.error;
    const spy = (console.error = jest.fn());
    renderHook(() => {
      const a = useFetcher(CoolerArticleResource.create());
      a({}, { content: 'hi' });
      return null;
    });
    expect(spy.mock.calls[0]).toMatchInlineSnapshot(`
      Array [
        "It appears you are trying to use Rest Hooks without a provider.
      Follow instructions: https://resthooks.io/docs/getting-started/installation#add-provider-at-top-level-component",
      ]
    `);
    console.error = oldError;
  });

  it('should dispatch an action that fetches a partial update', async () => {
    mynock.patch(`/article-cooler/1`).reply(200, payload);

    function DispatchTester() {
      const a = useFetcher(CoolerArticleResource.partialUpdate());
      a({ id: payload.id }, { content: 'changed' });
      return null;
    }
    await testDispatchFetch(DispatchTester, [payload]);
  });

  it('should dispatch an action that fetches a full update', async () => {
    mynock.put(`/article-cooler/1`).reply(200, payload);

    function DispatchTester() {
      const a = useFetcher(CoolerArticleResource.update());
      a({ id: payload.id }, { content: 'changed' });
      return null;
    }
    await testDispatchFetch(DispatchTester, [payload]);
  });
});

describe('useInvalidate', () => {
  it('should not invalidate anything if params is null', () => {
    const state = mockInitialState([
      {
        request: PaginatedArticleResource.list(),
        params: {},
        result: articlesPages,
      },
    ]);
    const dispatch = jest.fn();
    let invalidate: any;
    testRestHook(
      () => {
        invalidate = useInvalidator(PaginatedArticleResource.list());
      },
      state,
      dispatch,
    );
    invalidate(null);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('should return a function that dispatches an action to invalidate a resource', () => {
    const state = mockInitialState([
      {
        request: PaginatedArticleResource.list(),
        params: {},
        result: articlesPages,
      },
    ]);
    const dispatch = jest.fn();
    let invalidate: any;
    testRestHook(
      () => {
        invalidate = useInvalidator(PaginatedArticleResource.list());
      },
      state,
      dispatch,
    );
    invalidate({});
    expect(dispatch).toHaveBeenCalledWith({
      type: INVALIDATE_TYPE,
      meta: {
        key: 'GET http://test.com/article-paginated/',
      },
    });
  });
  it('should return the same === function each time', () => {
    const track = jest.fn();

    const { rerender } = renderHook(() => {
      const invalidate = useInvalidator(PaginatedArticleResource.list());
      useEffect(track, [invalidate]);
    });
    expect(track.mock.calls.length).toBe(1);
    for (let i = 0; i < 4; ++i) {
      rerender();
    }
    expect(track.mock.calls.length).toBe(1);
  });
});

describe('useResetter', () => {
  it('should return a function that dispatches an action to reset the cache', () => {
    const state = mockInitialState([
      {
        request: PaginatedArticleResource.list(),
        params: {},
        result: articlesPages,
      },
    ]);
    const dispatch = jest.fn();
    let reset: any;
    testRestHook(
      () => {
        reset = useResetter();
      },
      state,
      dispatch,
    );
    reset({});
    expect(dispatch).toHaveBeenCalledWith({
      type: RESET_TYPE,
    });
  });
  it('should return the same === function each time', () => {
    const track = jest.fn();

    const { rerender } = renderHook(() => {
      const reset = useResetter();
      useEffect(track, [reset]);
    });
    expect(track.mock.calls.length).toBe(1);
    for (let i = 0; i < 4; ++i) {
      rerender();
    }
    expect(track.mock.calls.length).toBe(1);
  });
});

describe('useRetrieve', () => {
  let renderRestHook: ReturnType<typeof makeRenderRestHook>;
  beforeEach(() => {
    mynock.get(`/article-cooler/${payload.id}`).reply(200, payload);
    mynock.get(`/article-static/${payload.id}`).reply(200, payload);
    mynock.get(`/user/`).reply(200, users);
    renderRestHook = makeRenderRestHook(makeCacheProvider);
  });
  afterEach(() => {
    nock.cleanAll();
  });

  it('should dispatch singles', async () => {
    function FetchTester() {
      useRetrieve(CoolerArticleResource.detail(), payload);
      return null;
    }
    await testDispatchFetch(FetchTester, [payload]);
  });

  it('should not dispatch will null params', () => {
    const dispatch = jest.fn();
    let params: any = null;
    const { rerender } = testRestHook(
      () => {
        useRetrieve(CoolerArticleResource.detail(), params);
      },
      initialState,
      dispatch,
    );
    expect(dispatch).toBeCalledTimes(0);
    params = payload;
    rerender();
    expect(dispatch).toBeCalled();
  });

  it('should dispatch with resource defined dataExpiryLength', async () => {
    function FetchTester() {
      useRetrieve(StaticArticleResource.detail(), payload);
      return null;
    }
    await testDispatchFetch(FetchTester, [payload]);
  });

  it('should dispatch with fetch shape defined dataExpiryLength', async () => {
    function FetchTester() {
      useRetrieve(StaticArticleResource.longLiving(), payload);
      return null;
    }
    await testDispatchFetch(FetchTester, [payload]);
  });

  it('should dispatch with fetch shape defined errorExpiryLength', async () => {
    function FetchTester() {
      useRetrieve(StaticArticleResource.neverRetryOnError(), payload);
      return null;
    }
    await testDispatchFetch(FetchTester, [payload]);
  });

  it('should not refetch after expiry and render', async () => {
    let time = 1000;
    global.Date.now = jest.fn(() => time);
    nock.cleanAll();
    const fetchMock = jest.fn(() => payload);
    mynock.get(`/article-cooler/${payload.id}`).reply(200, fetchMock).persist();
    const results: any[] = [
      {
        request: CoolerArticleResource.detail(),
        params: payload,
        result: payload,
      },
    ];
    const { result, rerender } = renderRestHook(
      () => {
        return useRetrieve(CoolerArticleResource.detail(), payload);
      },
      { results },
    );
    await result.current;
    expect(fetchMock).toHaveBeenCalledTimes(0);
    time += 100;
    rerender();
    await result.current;
    expect(fetchMock).toHaveBeenCalledTimes(0);
    // eslint-disable-next-line require-atomic-updates
    time += 610000000;
    rerender();
    await result.current;
    rerender();
    await result.current;
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });
});
