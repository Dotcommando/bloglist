<script lang="ts">
  import { Label, Popover } from 'bits-ui';
  import { flushSync, onMount, type Snippet, tick, untrack } from 'svelte';

  import { changedPageFields, type IComparablePage } from '../../../../src/domain/pages/page-editorial.policy';
  import { sitePath } from '../../app/admin-route';
  import { type AdminMessageKey, messages } from '../../i18n/i18n';
  import { RequestCacheScope } from '../../shared/api/content.types';
  import {
    type IAdminPage,
    type IAdminSite,
    type IPageAvailability,
    type IPageEditorBuffer,
    type IPageMetadata,
    type IPublicationOptions,
    OpenGraphType,
    PageEditorTab,
    PageSaveIntent,
    PublicationFeedback,
  } from '../../shared/api/content.types';
  import {
    contentError,
    ContentErrorMessage,
    ContentRequestError,
    getPageJsonLd,
    getPageMarkdown,
    getPublicationOptions,
    publishPage,
    savePage,
  } from '../../shared/api/content-api';
  import { scrollShadow } from '../../shared/browser/scroll-shadow';
  import Checkbox from '../../shared/ui/Checkbox.svelte';
  import FolderContents from '../../shared/ui/FolderContents.svelte';
  import type { CanUseAction } from '../access/site-actions';
  import JsonLdAssignments from '../json-ld/JsonLdAssignments.svelte';
  import type { TvValue } from '../template-variables/template-variables.types';
  import { UrlKind } from '../urls/urls.types';
  import { materializeVirtualUrl } from '../urls/urls-api';
  import { SitemapReason, SystemDocument } from './crawler.types';
  import OpenGraphImageField from './OpenGraphImageField.svelte';
  import { pageEditorFields } from './page-editor-fields';
  import { pagePathPrefix, suggestedPageMark, suggestedPagePath } from './page-slug';
  import { comparePages } from './page-tree';
  import PageTemplateVariables from './PageTemplateVariables.svelte';
  import SitemapContent from './SitemapContent.svelte';

  let { can, site, page, pages, first, onSaved, onCancel, onUnauthorized, onBusy, buffer, onBuffer,
    onOpenTemplate, onOpenUrl, routingRevision, onDirtyChange, toolbar, pageAvailability, onOpenPage,
    virtualFolderPath, onUrlCreated }: {
    can: CanUseAction;
    virtualFolderPath: string | null;
    onUrlCreated: () => Promise<void>;
    pageAvailability: readonly IPageAvailability[] | null;
    onOpenPage: (page: IAdminPage) => void;
    onOpenUrl: (pageId: string) => void;
    routingRevision: number;
    toolbar: Snippet;
    site: IAdminSite;
    page: IAdminPage | null;
    pages: readonly IAdminPage[];
    first: boolean;
    onSaved: (page: IAdminPage | null, published: boolean, completed: boolean) => void;
    onCancel: () => void;
    onUnauthorized: () => void;
    onBusy: (value: boolean) => void;
    buffer: IPageEditorBuffer | undefined;
    onBuffer: (buffer: IPageEditorBuffer) => void;
    onOpenTemplate: (id: string) => void;
    onDirtyChange: (dirty: boolean) => void;
  } = $props();
  let activeTab = $state(PageEditorTab.Main);
  let hasTvFields = $state(false);
  let tvLoadFailed = $state(false);
  const formId = $props.id();
  const initial = untrack(() => ({ page, site, first, buffer, virtualFolderPath }));
  let workingPage = $state(initial.page);
  const canSave = $derived(can(workingPage ? 'cms.pages.update' : 'cms.pages.create'));
  const canMoveExistingPage = $derived(Boolean(workingPage && !workingPage.systemDocument
    && can('cms.pages.set-position')));
  const canSetManualUrl = $derived(can('cms.urls.materialize'));
  const automaticOnCreate = $derived(!workingPage && !canSetManualUrl);
  const canGetOptions = $derived(can(initial.page ? 'cms.publication.page-options' : 'cms.publication.site-options'));
  const canShowTv = $derived(can('cms.template-variables.list') && can('cms.template-variables.read-page'));
  let jsonLdIssue = $state<string | null>(null);
  let jsonLdMenuOpen = $state(false);
  let validationFocus: HTMLElement | null = null;
  let markdownLoading = $state(false);
  let markdownContent = $state<string | null>(null);
  let markdownTitle = $state<AdminMessageKey | ''>('');
  let markdownDialog = $state<HTMLDialogElement>(null!);
  let options = $state<IPublicationOptions | null>(null);
  const canPublish = $derived(canGetOptions && can('cms.publication.publish-page')
    && (canSetManualUrl || !workingPage || Boolean(options?.path)));
  let optionsLoading = $state(true);
  let optionsError = $state(false);
  let showingPublished = $state(false);
  let editingSnapshot = $state<IPageEditorBuffer | null>(null);
  let editingTab = PageEditorTab.Main;
  let editingScroll = 0;
  let scrollPane = $state<HTMLDivElement>();
  let viewLoading = $state(false);
  const publishedPage = $derived(options?.editorial?.publishedPage ?? null);
  const comparisonBuffer = $derived(showingPublished && editingSnapshot ? editingSnapshot : captureBuffer());
  const changedFields = $derived(publishedPage && !optionsLoading
    ? changedPageFields(comparable(comparisonBuffer), publishedPage) : []);
  const unsavedFields = $derived(workingPage && !optionsLoading
    ? changedPageFields(comparable(comparisonBuffer), workingPage) : []);
  const savedChanges = $derived(options?.editorial?.pages.find((item) => item.pageId === workingPage?.pageId)
    ?.changedFields ?? []);
  const canCompare = $derived(Boolean(publishedPage && changedFields.length > 0));
  const primaryStatus = $derived(showingPublished ? $messages.publishedView
    : optionsLoading || optionsError ? $messages.pageAvailabilityUnknown
      : !publishedPage ? $messages.pageNeverPublished
        : changedFields.length ? $messages.unpublishedChanges : $messages.matchesPublished);

  function captureBuffer(): IPageEditorBuffer {
    return $state.snapshot({
      title,
      content,
      mark,
      markEdited,
      fallbackMark,
      language,
      templateId,
      requestCacheEnabled,
      requestCacheSeconds,
      path,
      pathEdited,
      parentPageId,
      sortOrder,
      metadata: { ...metadata },
      tvValues: { ...tvValues },
    });
  }

  function comparable(value: IPageEditorBuffer): IComparablePage {
    return {
      ...workingPage,
      ...value.metadata,
      title: value.title,
      contentMd: value.content,
      mark: value.mark,
      language: value.language,
      parentPageId: value.parentPageId,
      sortOrder: value.sortOrder,
      tvValues: value.tvValues ?? {},
      authoredTvValues: value.tvValues ?? {},
      ...(value.templateId ? {
        rendering: {
          ...workingPage?.rendering,
          templateId: value.templateId,
          requestCache: options?.requestDelivery ? value.requestCacheEnabled
            ? { scope: RequestCacheScope.SharedPublic, ttlMs: value.requestCacheSeconds! * 1000 } : null
            : workingPage?.rendering?.requestCache ?? null,
        },
      } : {}),
    };
  }

  function applyBuffer(value: IPageEditorBuffer): void {
    title = value.title;
    content = value.content;
    metadata = { ...value.metadata };
    tvValues = { ...value.tvValues };
    templateId = value.templateId;
    requestCacheEnabled = value.requestCacheEnabled ?? false;
    requestCacheSeconds = value.requestCacheSeconds ?? 60;
    path = value.path;
    pathEdited = value.pathEdited;
    parentPageId = value.parentPageId;
    sortOrder = value.sortOrder;
    language = value.language;
    manualMark = value.mark;
    markEdited = value.markEdited ?? false;
  }

  function displayPublished(): void {
    if (!publishedPage) {
      return;
    }
    applyBuffer({
      ...captureBuffer(),
      title: publishedPage.title,
      content: publishedPage.contentMd,
      metadata: metadataOf(publishedPage),
      tvValues: publishedPage.tvValues ?? {},
      templateId: publishedPage.rendering?.templateId ?? '',
      requestCacheEnabled: Boolean(publishedPage.rendering?.requestCache),
      requestCacheSeconds: (publishedPage.rendering?.requestCache?.ttlMs ?? 60000) / 1000,
      path: availability?.publicPath ?? '',
      parentPageId: publishedPage.parentPageId,
      sortOrder: publishedPage.sortOrder,
      language: publishedPage.language,
      mark: publishedPage.mark,
    });
  }

  async function togglePublished(): Promise<void> {
    if (viewLoading || pending) {
      return;
    }
    if (showingPublished && editingSnapshot) {
      flushSync(() => {
        applyBuffer(editingSnapshot!);
        showingPublished = false;
        activeTab = editingTab;
        editingSnapshot = null;
      });
      await tick();

      if (scrollPane) {
        scrollPane.scrollTop = editingScroll;
      }

      return;
    }
    if (!workingPage || !canCompare) {
      return;
    }
    viewLoading = true;

    try {
      const next = await getPublicationOptions(site.siteId, workingPage.pageId);

      if (disposed) {
        return;
      }
      options = next;

      if (!publishedPage) {
        return;
      }
      editingSnapshot = captureBuffer();
      editingTab = activeTab;
      editingScroll = scrollPane?.scrollTop ?? 0;
      flushSync(() => {
        showingPublished = true;
        displayPublished();
      });
      await tick();

      if (scrollPane) {
        scrollPane.scrollTop = editingScroll;
      }
    } catch (failure) {
      if (failure instanceof ContentRequestError && failure.status === 401) {
        onUnauthorized();
      } else {
        error = contentError(failure);
      }
    } finally {
      viewLoading = false;
    }
  }

  function tabHasChanges(tab: PageEditorTab): boolean {
    return changedFields.some((field) => tab === PageEditorTab.TemplateVariables ? field.startsWith('tvValues.')
      : tab === PageEditorTab.OpenGraph ? field.startsWith('og')
        : tab === PageEditorTab.Seo ? ['metaTitle', 'metaDescription', 'robotsIndex', 'excludeFromSitemap']
          .includes(field)
          : !field.startsWith('tvValues.') && !field.startsWith('og')
            && !['metaTitle', 'metaDescription', 'robotsIndex', 'excludeFromSitemap'].includes(field));
  }
  let templateId = $state(initial.buffer?.templateId ?? '');
  const editorTemplateId = $derived(canGetOptions ? templateId : workingPage?.rendering?.templateId ?? '');
  let requestCacheEnabled = $state(initial.buffer?.requestCacheEnabled ?? false);
  let requestCacheSeconds = $state(initial.buffer?.requestCacheSeconds ?? 60);
  let path = $state(initial.buffer?.path ?? initial.virtualFolderPath ?? (initial.page ? '' : '/'));
  let pathEdited = $state(initial.buffer?.pathEdited ?? Boolean(initial.virtualFolderPath));
  let metadata = $state<IPageMetadata>(initial.buffer?.metadata ?? metadataOf(initial.page));
  let intent = $state(PageSaveIntent.Draft);
  let publicationFeedback = $state<PublicationFeedback | null>(null);
  let title = $state(initial.buffer?.title ?? initial.page?.title ?? (initial.first
    ? initial.site.defaultLanguage === 'ru' ? 'Главная' : initial.site.defaultLanguage === 'en' ? 'Home' : '' : ''));
  let content = $state(initial.buffer?.content ?? initial.page?.contentMd ?? '');
  let tvValues = $state<Record<string, TvValue>>(initial.buffer?.tvValues ?? initial.page?.tvValues ?? {});
  let tvEditor = $state<PageTemplateVariables>();
  const fallbackMark = untrack(() => initial.buffer?.fallbackMark
    ?? 'Page' + crypto.randomUUID().replaceAll('-', '').slice(0, 8));
  let markEdited = $state(initial.buffer?.markEdited ?? Boolean(initial.buffer));
  let manualMark = $state(initial.buffer?.mark ?? '');
  let language = $state(initial.buffer?.language ?? initial.page?.language ?? initial.site.defaultLanguage);
  let parentPageId = $state(initial.buffer?.parentPageId ?? initial.page?.parentPageId ?? null);
  let sortOrder = $state<number | null>(initial.buffer?.sortOrder ?? initial.page?.sortOrder ?? null);
  const suggestedOrder = $derived(Math.max(0, ...pages.filter((item) => item.parentPageId === parentPageId)
    .map((item) => item.sortOrder)) + 100);
  let pending = $state(false);
  let error = $state<ContentErrorMessage | null>(null);
  let completed = $state(false);
  const readOnly = $derived(workingPage?.systemDocument === SystemDocument.Sitemap);
  const locked = $derived(pending || completed || readOnly || !canSave);
  const isHtml = $derived((metadata.mimeType ?? 'text/html').toLowerCase() === 'text/html');
  const canPublishSavedDraft = $derived(Boolean(workingPage && !readOnly && !canSave
    && can('cms.publication.publish-page')));
  const savedDraftReady = $derived(Boolean(options?.path
    && (!isHtml || options.templates.some((template) => template.templateId === options?.templateId))));
  const savedDraftPublishDisabled = $derived(pending || completed || showingPublished || optionsLoading || optionsError
    || publicationFeedback === PublicationFeedback.SavedDraftUnconfirmed);
  const showEditorTabs = $derived(isHtml);
  const editorTabs = $derived(isHtml ? [PageEditorTab.Main, PageEditorTab.Seo, PageEditorTab.OpenGraph,
    ...(hasTvFields && canShowTv ? [PageEditorTab.TemplateVariables] : [])] : [PageEditorTab.Main]);

  $effect(() => {
    if (!editorTabs.includes(activeTab)) {
      activeTab = PageEditorTab.Main;
    }
  });

  function navigateEditorTabs(event: KeyboardEvent): void {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      return;
    }
    event.preventDefault();
    const offset = event.key === 'ArrowLeft' ? -1 : 1;
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? editorTabs.length - 1
      : (editorTabs.indexOf(activeTab) + offset + editorTabs.length) % editorTabs.length;

    activeTab = editorTabs[index]!;
    document.getElementById(formId + '-' + activeTab + '-tab')?.focus();
  }

  function revealInvalidField(event: Event): void {
    const target = event.target;
    const panel = target instanceof HTMLElement ? target.closest('[role="tabpanel"]') : null;
    const tab = editorTabs.find((item) => panel?.id === formId + '-' + item + '-panel') ?? PageEditorTab.Main;

    validationFocus = jsonLdMenuOpen && target instanceof HTMLElement ? target : null;
    flushSync(() => {
      activeTab = tab;
      jsonLdMenuOpen = false;
    });
  }

  let customMime = $state(false);
  const mimeTypes = $derived(options?.mimeTypes ?? ['text/html']);
  const showCustomMime = $derived(customMime || !mimeTypes.includes(metadata.mimeType ?? 'text/html'));
  const crawler = $derived(options?.crawlerDiagnostics?.find((item) => item.pageId === workingPage?.pageId));
  const crawlerReason = $derived(crawler?.reason === SitemapReason.Noindex ? $messages.sitemapNoindex
    : crawler?.reason === SitemapReason.Explicit ? $messages.sitemapExplicit
      : crawler?.reason === SitemapReason.Robots ? $messages.sitemapRobots
        : crawler?.reason === SitemapReason.SystemDocument ? $messages.sitemapSystem
          : crawler?.reason === SitemapReason.NoOrigin ? $messages.sitemapNoOrigin
            : options?.pageAvailability.some((item) => item.pageId === workingPage?.pageId && item.publicPath)
              ? $messages.sitemapNotIncluded : $messages.pageNotPublic);
  const availability = $derived((options?.pageAvailability ?? pageAvailability)
    ?.find((item) => item.pageId === workingPage?.pageId));
  const canRequestPublishedOutput = $derived(Boolean(workingPage && (availability?.publicPath
    || options === null && pageAvailability === null)));
  const missingUrl = $derived(Boolean(workingPage && options && !options.path && !optionsLoading && !optionsError));
  const parentUrl = $derived(pageAvailability?.find((item) => item.pageId === parentPageId)?.assignedPath);
  const parentPath = $derived(pagePathPrefix(parentUrl));
  const mark = $derived(workingPage?.mark ?? (markEdited ? manualMark
    : suggestedPageMark(path === parentPath && !pathEdited && !initial.first ? '' : path,
      fallbackMark, pages.map((page) => page.mark))));
  const defaultPath = $derived(options?.path ?? initial.virtualFolderPath
    ?? (workingPage && pageAvailability === null ? '' : parentPath));
  const children = $derived(pages.filter((item) => item.parentPageId === workingPage?.pageId).toSorted(comparePages));
  const childItems = $derived(children.map((child) => {
    const state = pageAvailability?.find((item) => item.pageId === child.pageId);

    return {
      id: child.pageId,
      label: child.title,
      href: sitePath(site.siteId) + '/pages/' + child.pageId,
      detail: pageAvailability === null ? $messages.pageAvailabilityUnknown
        : (state?.assignedPath ?? $messages.pageNoUrl) + ' · '
          + (state?.publicPath ? $messages.pagePublic : $messages.pageNotPublic),
    };
  }));
  let disposed = false;
  let seenRoutingRevision = untrack(() => routingRevision);
  const initialFields = untrack(() => ({ title, content, mark, language }));

  $effect.pre(() => {
    const comparisonVisible = canCompare || showingPublished;

    return untrack(() => {
      const pane = scrollPane;
      const input = document.activeElement;

      if (
        !pane
        || window.matchMedia('(min-width: 992px)').matches
        || !(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)
        || !pane.contains(input)
      ) {
        return;
      }

      const top = input.getBoundingClientRect().top;
      let cancelled = false;
      const anchoring = pane.style.overflowAnchor;

      pane.style.overflowAnchor = 'none';

      // Run after Svelte updates the status, before the browser paints.
      queueMicrotask(() => {
        if (cancelled) {
          return;
        }

        try {
          if (
            disposed
            || !pane.isConnected
            || document.activeElement !== input
            || comparisonVisible !== (canCompare || showingPublished)
          ) {
            return;
          }

          const scroll = Math.max(0, pane.scrollTop + input.getBoundingClientRect().top - top);
          const missing = Math.ceil(scroll - (pane.scrollHeight - pane.clientHeight));

          if (missing > 0) {
            const tail = Number.parseFloat(pane.style.getPropertyValue('--cms-editing-scroll-tail')) || 0;

            pane.style.setProperty('--cms-editing-scroll-tail', tail + missing + 'px');
          }
          pane.scrollTop = scroll;
        } finally {
          pane.style.overflowAnchor = anchoring;
        }
      });

      return () => {
        cancelled = true;
        pane.style.overflowAnchor = anchoring;
      };
    });
  });

  $effect(() => {
    if (showingPublished) {
      return;
    }

    const snapshot = {
      title,
      content,
      mark,
      markEdited,
      fallbackMark,
      language,
      templateId,
      requestCacheEnabled,
      requestCacheSeconds,
      path,
      pathEdited,
      parentPageId,
      sortOrder,
      metadata: { ...metadata },
      tvValues: { ...tvValues },
    };

    untrack(() => onBuffer(snapshot));
  });

  $effect(() => {
    if (showingPublished) {
      return;
    }

    const dirty = title !== (workingPage?.title ?? initialFields.title)
      || content !== (workingPage?.contentMd ?? initialFields.content)
      || JSON.stringify(tvValues) !== JSON.stringify(workingPage?.tvValues ?? {})
      || sortOrder !== (workingPage?.sortOrder ?? null)
      || !workingPage && parentPageId !== null
      || mark !== initialFields.mark || language !== initialFields.language
      || JSON.stringify(metadata) !== JSON.stringify(metadataOf(workingPage))
      || !optionsLoading && (requestCacheEnabled !== Boolean(options?.requestCache)
        || requestCacheEnabled && requestCacheSeconds !== (options?.requestCache?.ttlMs ?? 60000) / 1000)
      || !optionsLoading && (templateId !== (options?.templateId ?? '')
        || path !== defaultPath);

    untrack(() => onDirtyChange(dirty));
  });

  $effect(() => {
    if ((!workingPage || missingUrl) && pageAvailability !== null && !pathEdited) {
      path = workingPage ? parentPath : suggestedPagePath(title, {
        path: parentPath, parentPath, first: initial.first, existing: false, manual: false,
      });
    }
  });

  $effect(() => {
    const current = page;

    if (current && workingPage?.pageId === current.pageId && current.parentPageId !== workingPage.parentPageId) {
      workingPage = { ...workingPage, parentPageId: current.parentPageId };
      parentPageId = current.parentPageId;
    }
  });

  function metadataOf(saved: IAdminPage | null): IPageMetadata {
    return {
      mimeType: saved?.mimeType ?? 'text/html',
      excludeFromSitemap: saved?.excludeFromSitemap ?? false,
      h1: saved?.h1 ?? null,
      metaTitle: saved?.metaTitle ?? null,
      metaDescription: saved?.metaDescription ?? null,
      robotsIndex: saved?.robotsIndex ?? true,
      ogTitle: saved?.ogTitle ?? null,
      ogDescription: saved?.ogDescription ?? null,
      ogImage: saved?.ogImage ?? null,
      ogType: saved?.ogType ?? null,
    };
  }

  async function refreshPublishedView(): Promise<void> {
    if (!showingPublished || !workingPage || viewLoading) {
      return;
    }
    viewLoading = true;

    try {
      const next = await getPublicationOptions(site.siteId, workingPage.pageId);

      if (disposed || !showingPublished) {
        return;
      }

      const changed = next.editorial?.releaseId !== options?.editorial?.releaseId;

      options = next;

      if (changed && publishedPage) {
        displayPublished();
      } else if (!publishedPage && editingSnapshot) {
        await togglePublishedAfterRemoval();
      }
    } catch (failure) {
      if (!disposed) {
        if (failure instanceof ContentRequestError && failure.status === 401) {
          onUnauthorized();
        } else {
          error = contentError(failure);
        }
      }
    } finally {
      viewLoading = false;
    }
  }

  async function togglePublishedAfterRemoval(): Promise<void> {
    if (!editingSnapshot) {
      return;
    }
    applyBuffer(editingSnapshot);
    showingPublished = false;
    activeTab = editingTab;
    editingSnapshot = null;
    await tick();

    if (scrollPane) {
      scrollPane.scrollTop = editingScroll;
    }
  }

  onMount(() => {
    if (!canGetOptions) {
      optionsLoading = false;

      return () => {
        disposed = true;
      };
    }

    const refresh = (): void => {
      void refreshPublishedView();
    };
    const interval = setInterval(refresh, 15000);

    window.addEventListener('focus', refresh);
    void getPublicationOptions(site.siteId, initial.page?.pageId).then((result) => {
      if (!disposed) {
        options = result;

        if (!initial.buffer) {
          templateId = result.templateId ?? '';
          requestCacheEnabled = Boolean(result.requestCache);
          requestCacheSeconds = (result.requestCache?.ttlMs ?? 60000) / 1000;
          path = result.path ?? path;
        }
      }
    }).catch((failure) => {
      if (!disposed) {
        if (failure instanceof ContentRequestError && failure.status === 401) {
          onUnauthorized();
        } else {
          optionsError = true;
        }
      }
    }).finally(() => {
      if (!disposed) {
        optionsLoading = false;
      }
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  });

  $effect(() => {
    const revision = routingRevision;

    if (revision !== seenRoutingRevision) {
      seenRoutingRevision = revision;
      untrack(() => {
        if (initial.page && canGetOptions) {
          void getPublicationOptions(site.siteId, initial.page.pageId).then((result) => {
            if (!disposed) {
              options = result;

              if (result.path || !pathEdited) {
                path = result.path ?? '';
              }
            }
          }).catch((failure) => {
            if (failure instanceof ContentRequestError && failure.status === 401) {
              onUnauthorized();
            } else {
              optionsError = true;
            }
          });
        }
      });
    }
  });

  async function submit(event: SubmitEvent): Promise<void> {
    event.preventDefault();

    if (locked || showingPublished) {
      return;
    }
    intent = event.submitter instanceof HTMLButtonElement && event.submitter.value === PageSaveIntent.Publish
      ? PageSaveIntent.Publish : PageSaveIntent.Draft;
    publicationFeedback = null;
    error = null;

    if (
      requestCacheEnabled
      && (!Number.isInteger(requestCacheSeconds)
      || requestCacheSeconds < 1
      || requestCacheSeconds > 3600)
    ) {
      error = ContentErrorMessage.Invalid;

      return;
    }
    if (
      intent === PageSaveIntent.Publish
      && (!canPublish
      || isHtml
      && !templateId
      || !options
      || canSetManualUrl
      && (!path
      || (!workingPage
      || missingUrl)
      && parentUrl
      && path.trim() === parentPath))
    ) {
      publicationFeedback = PublicationFeedback.Invalid;

      return;
    }
    pending = true;
    onBusy(true);
    error = null;
    let result: IAdminPage | null = null;
    let published = false;
    let unauthorized = false;

    try {
      result = await savePage(site.siteId, workingPage, {
        title,
        mark,
        language,
        contentMd: content,
        ...metadata,
        ...(workingPage && isHtml && options?.requestDelivery ? {
          requestCache: requestCacheEnabled ? {
            scope: RequestCacheScope.SharedPublic,
            ttlMs: requestCacheSeconds * 1000,
          } : null,
        } : {}),
        ...(!workingPage ? { parentPageId } : {}),
        ...(sortOrder !== null ? { sortOrder } : {}),
      });

      if (!result) {
        if (!disposed) {
          onSaved(null, false, true);
        }

        return;
      }
      workingPage = result;

      if (options?.requestDelivery) {
        options = {
          ...options,
          requestCache: requestCacheEnabled
            ? { scope: RequestCacheScope.SharedPublic, ttlMs: requestCacheSeconds * 1000 } : null,
        };
      }
      sortOrder = result.sortOrder;
      const tvUpdatedAt = can('cms.template-variables.save-page')
        ? await tvEditor?.save(result.pageId, result.updatedAt) : undefined;

      result = { ...result, tvValues: { ...tvValues }, ...(tvUpdatedAt ? { updatedAt: tvUpdatedAt } : {}) };
      workingPage = result;

      if (initial.virtualFolderPath && !options?.path && can('cms.urls.materialize')) {
        const binding = await materializeVirtualUrl(site.siteId, { kind: UrlKind.Page, pageId: result.pageId, path });

        path = binding.url.path;

        if (options) {
          options = { ...options, path };
        }
        await onUrlCreated();
      }
      if (intent === PageSaveIntent.Publish) {
        result = await publishPage(site.siteId, result.pageId, templateId, canSetManualUrl ? path : undefined);
        result = { ...result, tvValues: { ...tvValues } };
        workingPage = result;
        published = true;

        if (options) {
          options = { ...options, templateId, path: canSetManualUrl ? path : options.path };
        }
      }
      completed = true;
    } catch (failure) {
      if (failure instanceof ContentRequestError && failure.status === 401) {
        unauthorized = true;

        if (!disposed) {
          onUnauthorized();
        }
      } else if (result && intent === PageSaveIntent.Publish) {
        publicationFeedback = failure instanceof ContentRequestError && failure.status === 409
          ? PublicationFeedback.Conflict : PublicationFeedback.Failed;
        optionsLoading = true;
        optionsError = false;

        try {
          const reconciled = await getPublicationOptions(site.siteId, result.pageId);

          if (!disposed) {
            options = reconciled;

            if (reconciled.path) {
              path = reconciled.path;
            }
          }
        } catch (readFailure) {
          if (!disposed) {
            if (readFailure instanceof ContentRequestError && readFailure.status === 401) {
              unauthorized = true;
              onUnauthorized();
            } else {
              optionsError = true;
            }
          }
        } finally {
          optionsLoading = false;
        }
      } else {
        error = contentError(failure);
        jsonLdIssue = failure instanceof ContentRequestError ? failure.jsonLdIssue : null;
      }
    } finally {
      pending = false;
      onBusy(false);
    }

    if (result && !unauthorized && !disposed) {
      onSaved(result, published, completed);
    }
  }
  async function publishSavedDraft(): Promise<void> {
    if (!workingPage || !canPublishSavedDraft || !savedDraftReady || savedDraftPublishDisabled) {
      return;
    }
    pending = true;
    error = null;
    publicationFeedback = null;
    onBusy(true);
    let published: IAdminPage | null = null;

    try {
      published = await publishPage(site.siteId, workingPage.pageId, '');
      completed = true;
    } catch (failure) {
      if (!disposed) {
        if (failure instanceof ContentRequestError && failure.status === 401) {
          onUnauthorized();
        } else {
          publicationFeedback = PublicationFeedback.SavedDraftUnconfirmed;
        }
      }
    } finally {
      pending = false;
      onBusy(false);
    }

    if (published && !disposed) {
      onSaved(published, true, true);
    }
  }

  async function openMarkdown(published: boolean, jsonLd = false): Promise<void> {
    if (!workingPage || markdownLoading) {
      return;
    }
    jsonLdMenuOpen = false;
    markdownLoading = true;

    try {
      jsonLdIssue = null;
      markdownContent = await (jsonLd ? getPageJsonLd : getPageMarkdown)(site.siteId, workingPage.pageId, published);
      markdownTitle = jsonLd ? published ? 'jsonLdPublishedTitle' : 'jsonLdDraftTitle'
        : published ? 'markdownPublishedTitle' : 'markdownDraftTitle';
      await tick();
      markdownDialog.showModal();
    } catch (failure) {
      if (failure instanceof ContentRequestError && failure.status === 401) {
        onUnauthorized();
      } else {
        error = contentError(failure);
        jsonLdIssue = failure instanceof ContentRequestError ? failure.jsonLdIssue : null;
      }
    } finally {
      markdownLoading = false;
    }
  }

</script>

{#snippet seoFields()}
  <fieldset class="_page-field-group" disabled={locked && !showingPublished}>
    {#if !isHtml}<legend>{$messages.seoSettings}</legend>{/if}
    <div class:_form-row={isHtml}>
      {#if isHtml}
        <div class="_form-field">
          <Label.Root for="page-meta-title">{$messages.metaTitle}</Label.Root>
          <input id="page-meta-title" value={metadata.metaTitle ?? ''}
            oninput={(event) => metadata.metaTitle = event.currentTarget.value || null} />
        </div>
      {/if}
      <div class="_form-field">
        <Label.Root for="page-robots">{$messages.robotsIndex}</Label.Root>
        <select id="page-robots" value={metadata.robotsIndex ? 'index' : 'noindex'}
          onchange={(event) => metadata.robotsIndex = event.currentTarget.value === 'index'}>
          <option value="index">{$messages.allowIndexing}</option>
          <option value="noindex">{$messages.disallowIndexing}</option>
        </select>
      </div>
    </div>
    {#if isHtml}
      <div class="_form-field">
        <Label.Root for="page-meta-description">{$messages.metaDescription}</Label.Root>
        <textarea id="page-meta-description" class="_page-metadata-description" rows="3"
          value={metadata.metaDescription ?? ''}
          oninput={(event) => metadata.metaDescription = event.currentTarget.value || null}></textarea>
      </div>
    {/if}
    {#if !workingPage?.systemDocument}
      <details data-editorial-field="excludeFromSitemap" open={changedFields.includes('excludeFromSitemap')}>
        <summary>{$messages.advancedSeo}</summary>
        <Checkbox checked={metadata.excludeFromSitemap ?? false} disabled={locked}
          onCheckedChange={(value) => metadata.excludeFromSitemap = value}>{$messages.excludeFromSitemap}</Checkbox>
      </details>
    {/if}
  </fieldset>
{/snippet}

{#if jsonLdIssue}
  <div class="cms-error" role="alert"><p>{jsonLdIssue}</p>
    {#if can('cms.json-ld.list')}
    <a href={sitePath(site.siteId) + '/jsonLd'}>JSON-LD · {$messages.settings}</a>
    {/if}
  </div>
{/if}
{#if markdownContent !== null}
  <dialog bind:this={markdownDialog} onclose={() => {
    markdownContent = null;
  }} class="markdown-dialog">
    <h2>{markdownTitle ? $messages[markdownTitle] : ''}</h2>
    <pre>{markdownContent}</pre>
    <button class="cms-secondary" type="button" onclick={() => markdownDialog.close()}>{$messages.cancel}</button>
  </dialog>
{/if}

{#snippet publishedToggle()}
  <button class="cms-secondary cms-compact" type="button" disabled={pending || viewLoading}
    aria-pressed={showingPublished} onclick={() => void togglePublished()}>
    {showingPublished ? $messages.returnToEditing : $messages.showPublished}
  </button>
{/snippet}

<div class="page-editor-frame">
  <div class="page-editor-controls" class:_page-editor-controls__comparison={canCompare || showingPublished}>
    <div class="_page-controls-inner">
      <div class="_page-title-row">{@render toolbar()}</div>
      <div class="_page-actions-row">
        <div class="_published-toggle-slot">
          <span aria-hidden="true">{$messages.showPublished}</span>
          <span aria-hidden="true">{$messages.returnToEditing}</span>
          {#if canCompare || showingPublished}
            {@render publishedToggle()}
          {/if}
        </div>
        <div class="page-actions" role="group" aria-label={$messages.pageActions}>
          <Popover.Root bind:open={jsonLdMenuOpen}>
            <Popover.Trigger type="button" class="cms-secondary cms-compact json-ld-trigger" disabled={pending}>
              {$messages.moreActions}
              <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" /></svg>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content class="json-ld-popup _page-more-menu" side="bottom" align="end" sideOffset={6}
                collisionPadding={12} aria-label={$messages.moreActions} onCloseAutoFocus={(event) => {
                  if (validationFocus) {
                    event.preventDefault();
                    validationFocus.focus();
                    validationFocus = null;
                  }
                }}>
                <button class="_compact-menu-action cms-compact" type="button" disabled={pending}
                  onclick={onCancel}>{$messages.cancel}</button>
                {#if canSave}
                <button class="_compact-menu-action cms-compact" type="submit" form={formId}
                  value={PageSaveIntent.Draft} disabled={locked || showingPublished}>{$messages.saveDraft}</button>
                {/if}
                {#if can('cms.pages.read-published-markdown')}
                <button class="cms-compact" type="button" disabled={!canRequestPublishedOutput || markdownLoading}
                  onclick={() => openMarkdown(true)}>{$messages.viewMarkdown}</button>
                {/if}
                {#if can('cms.pages.preview-markdown')}
                <button class="cms-compact" type="button" disabled={!workingPage || markdownLoading}
                  onclick={() => openMarkdown(false)}>{$messages.viewDraftMarkdown}</button>
                {/if}
                {#if can('cms.json-ld.read-published-page')}
                <button class="cms-compact" type="button" disabled={!canRequestPublishedOutput || markdownLoading}
                  onclick={() => openMarkdown(true, true)}>{$messages.jsonLdPublishedTitle}</button>
                {/if}
                {#if can('cms.json-ld.preview-page')}
                <button class="cms-compact" type="button" disabled={!workingPage || markdownLoading}
                  onclick={() => openMarkdown(false, true)}>{$messages.jsonLdDraftTitle}</button>
                {/if}
                {#if can('cms.json-ld.list')}
                  <a class="cms-compact" href={sitePath(site.siteId) + '/jsonLd'}>JSON-LD · {$messages.settings}</a>
                {/if}
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>
          <button class="cms-secondary cms-compact _wide-page-action" type="button" disabled={pending}
            onclick={onCancel}>{$messages.cancel}</button>
          {#if canSave}
          <button class="cms-secondary cms-compact _wide-page-action" type="submit" form={formId}
            value={PageSaveIntent.Draft} disabled={locked || showingPublished}>
            {pending && intent === PageSaveIntent.Draft ? $messages.saving : $messages.saveDraft}
          </button>
          {/if}
          {#if canSave && canPublish}
          <button class="cms-primary cms-compact" type="submit" form={formId} value={PageSaveIntent.Publish}
            disabled={locked || showingPublished || optionsLoading || optionsError}>
            {pending && intent === PageSaveIntent.Publish ? $messages.publishing : $messages.savePublish}
          </button>
          {:else if canPublishSavedDraft && savedDraftReady}
            <button class="cms-primary cms-compact" type="button" disabled={savedDraftPublishDisabled}
              onclick={publishSavedDraft}>{pending ? $messages.publishing : $messages.publishSavedDraft}</button>
          {/if}
        </div>
      </div>
      {#if error || publicationFeedback || optionsError}
        <div class="_page-action-notice" aria-live="polite">
          {#if error}<p role="alert">{$messages[error]}</p>{/if}
          {#if publicationFeedback}<p role="alert">{$messages[publicationFeedback]}</p>{/if}
          {#if optionsError}<p role="alert">{$messages.publicationUnavailable}</p>{/if}
        </div>
      {/if}
    </div>
  </div>
  <div use:scrollShadow class="_workspace-scroll _page-editor-scroll" bind:this={scrollPane}>
    <section class="page-editor" aria-labelledby="page-editor-title">
      <div class="_page-status-area" aria-label={$messages.editingPage}>
        {#if canGetOptions}<div class="_page-status-item _page-status-primary">
          <svg viewBox="0 0 24 24" class="cms-icon" fill="none" aria-hidden="true">
            <path d={changedFields.length ? 'M13 3H5v18h14v-8M14 5l3-3 5 5-9 9-5 1 1-5 5-5'
              : 'm5 12 4 4L19 6'} />
          </svg>
          <div>
            <div role="status"><strong>{primaryStatus}</strong>
              <small>{showingPublished ? $messages.pagePublic
                : changedFields.length ? $messages.changedFieldCount.replace('{count}', String(changedFields.length))
                  : publishedPage ? $messages.pagePublic : $messages.pageNotPublic}</small>
            </div>
            {#if canCompare || showingPublished}
              <div class="_page-published-mobile">{@render publishedToggle()}</div>
            {/if}
          </div>
        </div>
        <div class="_page-status-item">
          <svg viewBox="0 0 24 24" class="cms-icon" fill="none" aria-hidden="true">
            <path d="M5 3h10l4 4v14H5V3Zm4 8h6m-6 4h6" /></svg>
          <div><strong>{unsavedFields.length ? $messages.unsavedEdits : $messages.editableDraft}</strong>
            <small>{savedChanges.length ? $messages.visitorsSeePublished
              : readOnly ? $messages.sitemapReadOnly : $messages.draftIntro}</small>
          </div>
        </div>
        <div class="_page-status-item">
          <svg viewBox="0 0 24 24" class="cms-icon" fill="none" aria-hidden="true">
            <path d="M9 3h6v5H9V3ZM4 16h5v5H4v-5Zm11 0h5v5h-5v-5ZM12 8v4M6 16v-4h12v4" /></svg>
          <div><strong>{$messages.sitemapStatus}:
            {crawler?.inSitemap ? $messages.sitemapIncluded : crawlerReason}</strong></div>
        </div>
        <div class="_page-status-item">
          <svg viewBox="0 0 24 24" class="cms-icon" fill="none" aria-hidden="true">
            <path d="M5 7h14v12H5V7Zm7-4v4M8 11h1m6 0h1m-7 4h6" /></svg>
          <div><strong>{$messages.crawlerAccess}: {crawler?.blockedBy.length ? $messages.crawlerBlocked
            : crawler ? $messages.crawlerAllowed : $messages.crawlerUnknown}</strong>
            <small title={crawler?.robotsAvailable ? $messages.robotsActiveHint : $messages.robotsMissingHint}>
              {crawler?.blockedBy.map((rule) => rule.agent + ': ' + rule.rule).join(' · ')
                || (crawler ? crawler.robotsAvailable ? $messages.robotsActiveHint : $messages.robotsMissingHint
                  : availability?.publicPath ? $messages.crawlerUnknown : $messages.pageNotPublic)}
            </small>
            {#if workingPage?.systemDocument === SystemDocument.Robots
              && options?.editorial?.robotsHasUnpublishedChanges}
              <small>{$messages.robotsUnpublished}</small>
            {/if}
          </div>
        </div>
      {:else if workingPage && pageAvailability !== null}
        <div class="_page-status-item" role="status">
          <strong>{availability?.publicPath ? $messages.pagePublic : $messages.pageNotPublic}</strong>
        </div>
      {/if}</div>
      {#if canPublishSavedDraft && !showingPublished}
        {#if !canGetOptions}
          <p class="_hint">{$messages.publishSavedDraftNeedsOptions}</p>
        {:else if options && !optionsLoading && !optionsError}
          <p class="_hint">{savedDraftReady ? $messages.publishSavedDraftHint : options.path
            ? $messages.publishSavedDraftNeedsTemplate : $messages.publishSavedDraftNeedsUrl}</p>
        {/if}
      {/if}
      {#if initial.virtualFolderPath}
        <p class="_url-publication-hint">{$messages.urlCreateFolderPageHint}</p>
      {/if}
      {#if children.length}
        <FolderContents summary={$messages.folderPagesSummary.replace('{pages}', String(children.length))}
          items={childItems} disabled={locked} onSelect={(id) => {
            const child = children.find((item) => item.pageId === id);

            if (child) {
              onOpenPage(child);
            }
          }} />
      {/if}
      <form id={formId} class="cms-form" onsubmit={submit} aria-busy={pending}
        oninvalidcapture={revealInvalidField}
        use:pageEditorFields={{
          readonly: showingPublished,
          changedFields,
          unsavedFields,
        }}>
        {#if tvLoadFailed}<p class="cms-error" role="alert">{$messages.tvLoadFailed}</p>{/if}
        {#if showEditorTabs}
          <div class="cms-tabs _editor-tabs" role="tablist" aria-label={$messages.pageEditorTabs}>
            {#each editorTabs as tab (tab)}
              <button class="cms-tab" type="button" role="tab" id={formId + '-' + tab + '-tab'}
                aria-controls={formId + '-' + tab + '-panel'} aria-selected={activeTab === tab}
                tabindex={activeTab === tab ? 0 : -1}
                onclick={() => activeTab = tab} onkeydown={navigateEditorTabs}>
                {#if tabHasChanges(tab)}
                  <span class="_changed-tab-marker" aria-label={$messages.fieldChanged}>●</span>
                {/if}
                {tab === PageEditorTab.Main ? $messages.pageMainTab : tab === PageEditorTab.Seo ? 'SEO'
                  : tab === PageEditorTab.OpenGraph ? 'Open Graph' : $messages.templateVariables}
              </button>
            {/each}
          </div>
        {/if}
        <div class="cms-form _editor-panel" id={formId + '-main-panel'}
          role={showEditorTabs ? 'tabpanel' : undefined}
          aria-labelledby={showEditorTabs ? formId + '-main-tab' : undefined}
          hidden={showEditorTabs && activeTab !== PageEditorTab.Main}>
        <div class="_form-row">
        <div class="_form-field">
          <Label.Root for="page-title">{$messages.pageTitle}</Label.Root>
          <input id="page-title" bind:value={title} required disabled={locked} />
        </div>
          {#if isHtml || automaticOnCreate}<div class="_form-field">
            <Label.Root for="page-h1">{$messages.pageHeading}</Label.Root>
            <input id="page-h1" disabled={locked} value={metadata.h1 ?? ''} required={automaticOnCreate}
              aria-describedby={automaticOnCreate ? 'page-automatic-url-hint' : undefined}
              oninput={(event) => metadata.h1 = event.currentTarget.value || null} />
            {#if automaticOnCreate}<small id="page-automatic-url-hint">{$messages.pageAutomaticUrlHint}</small>{/if}
          </div>{/if}
        </div>
        {#if canGetOptions || initial.virtualFolderPath}
        <fieldset class="_page-field-group" disabled={(locked || optionsLoading) && !showingPublished}>
          <legend>{$messages.publicationSettings}</legend>
          <div class="_form-row">
            {#if isHtml && canGetOptions}<div class="_form-field">
              <Label.Root for="page-template">{$messages.template}</Label.Root>
              <select id="page-template" bind:value={templateId}>
                <option value="">{$messages.chooseTemplate}</option>
                {#each options?.templates ?? [] as option (option.templateId)}
                  <option value={option.templateId}
                    disabled={option.requiresParameters && option.templateId !== options?.templateId}>
                    {option.templateId === 'ZaryaBasic' && option.name === 'ZaryaBasic'
                      ? $messages.basicTemplate : option.name}
                    {option.requiresParameters ? ' (' + $messages.templateParametersRequired + ')' : ''}
                  </option>
                {/each}
              </select>
              {#if templateId && can('cms.templates.read')}
                <button type="button" class="_usage-link" disabled={locked} onclick={() => {
                  onOpenTemplate(templateId);
                }}>{$messages.openTemplate}</button>
              {/if}
            </div>{/if}
            {#if canSetManualUrl || options?.path}<div class="_form-field">
              <Label.Root for="page-path">{$messages.publicPath}</Label.Root>
              <input id="page-path" bind:value={path} readonly={!canSetManualUrl || Boolean(options?.path)}
                oninput={() => pathEdited = true}
                autocapitalize="none" spellcheck="false" placeholder="/"
                aria-describedby={missingUrl ? 'path-hint path-unassigned' : 'path-hint'} />
              <small id="path-hint">{options?.path ? $messages.existingPathHint
                : (missingUrl || !workingPage) && parentUrl
                  ? $messages.pageParentPathHint.replace('{path}', () => parentPath)
                  : $messages.publicPathHint}</small>
              {#if missingUrl}
                <small id="path-unassigned" class="_page-url-warning" role="status">
                  {availability?.publicPath ? $messages.pageNoAssignedUrlStillPublic : $messages.pageNoUrlHint}
                </small>
              {/if}
              {#if can('cms.urls.list') && options?.path && workingPage && !workingPage.systemDocument}
                <a class="_url-editor-link" href={sitePath(site.siteId) + '/urls/-/page/' + workingPage.pageId}
                  aria-disabled={locked} tabindex={locked ? -1 : undefined} onclick={(event) => {
                    if (locked) {
                      event.preventDefault();
                    } else if (!event.ctrlKey && !event.metaKey && !event.shiftKey) {
                      event.preventDefault();

                      if (workingPage) {
                        onOpenUrl(workingPage.pageId);
                      }
                    }
                  }}>{$messages.urlEditAddress}</a>
              {/if}
            </div>{/if}
          </div>
        </fieldset>
        {:else if initial.page && canSave && !readOnly}
          <p class="_hint">{$messages.pageDraftWithoutPublicationOptions}</p>
        {/if}
        {#if isHtml && options?.requestDelivery}
          <fieldset class="_page-field-group" data-editorial-field="rendering.requestCache"
            disabled={locked || optionsLoading}>
            <legend>{$messages.requestCacheTitle}</legend>
            <Checkbox checked={requestCacheEnabled} onCheckedChange={(value) => requestCacheEnabled = value}
              disabled={locked}>{$messages.requestCacheEnabled}</Checkbox>
            <p class="_hint">{$messages.requestCacheHint}</p>
            {#if requestCacheEnabled}
              <div class="_form-field">
                <Label.Root for="page-request-cache-ttl">{$messages.requestCacheTtl}</Label.Root>
                <input id="page-request-cache-ttl" type="number" min="1" max="3600" step="1" required
                  bind:value={requestCacheSeconds}
                  aria-describedby={requestCacheSeconds <= 20 ? 'page-request-cache-warning' : undefined} />
                {#if Number.isFinite(requestCacheSeconds) && requestCacheSeconds > 0 && requestCacheSeconds <= 20}
                  <p id="page-request-cache-warning" class="_page-cache-warning" role="status">
                    {$messages.requestCacheShortTtlWarning}
                  </p>
                {/if}
              </div>
            {/if}
          </fieldset>
        {/if}
        <div class="_form-row">
          <div class="_form-field">
            <Label.Root for="page-mime">{$messages.documentMime}</Label.Root>
            <select id="page-mime" value={showCustomMime ? 'custom' : metadata.mimeType}
              disabled={(locked || Boolean(workingPage?.systemDocument)) && !showingPublished} onchange={(event) => {
                customMime = event.currentTarget.value === 'custom';

                if (!customMime) {
                  metadata.mimeType = event.currentTarget.value;
                }
              }}>
              {#each mimeTypes as type (type)}<option value={type}>{type}</option>{/each}
              <option value="custom">{$messages.customMime}</option>
            </select>
          </div>
          {#if showCustomMime}<div class="_form-field">
            <Label.Root for="page-custom-mime">{$messages.customMime}</Label.Root>
            <input id="page-custom-mime" bind:value={metadata.mimeType} required maxlength="255"
              pattern="[A-Za-z0-9!#$&amp;^_.+\-]+/[A-Za-z0-9!#$&amp;^_.+\-]+"
              disabled={locked || Boolean(workingPage?.systemDocument)} spellcheck="false" autocapitalize="none" />
          </div>{/if}
        </div>
        <div class="_form-row">
          <div class="_form-field">
            <Label.Root for="page-number">{$messages.pageNumber}</Label.Root>
            <input id="page-number" value={workingPage?.pageNumber ?? ''}
              readonly placeholder={$messages.automaticNumber} />
          </div>
          <div class="_form-field">
            <Label.Root for="page-order">{$messages.sortOrder}</Label.Root>
            <input id="page-order" type="number" min="0" max="9007199254740991" step="1"
              value={sortOrder ?? ''} placeholder={String(suggestedOrder)} disabled={locked}
              oninput={(event) => {
                sortOrder = event.currentTarget.value === '' ? null : event.currentTarget.valueAsNumber;
              }}
              required={workingPage !== null} aria-describedby="order-hint" />
            <small id="order-hint">{$messages.sortOrderHint}</small>
          </div>
        </div>
        {#if can('cms.pages.list')}<div class="_form-field">
          <Label.Root for="page-parent">{$messages.parentPage}</Label.Root>
          <select id="page-parent" bind:value={parentPageId}
            disabled={(locked || workingPage !== null) && !showingPublished}>
            <option value={null}>{$messages.siteRoot}</option>
            {#each pages.filter((item) => item.pageId !== workingPage?.pageId
              && !item.systemDocument) as item (item.pageId)}
              <option value={item.pageId}>{item.title} #{item.pageNumber ?? ''}</option>
            {/each}
          </select>
          {#if canMoveExistingPage}<small>{$messages.movePageHint}</small>{/if}
        </div>
        {:else if canMoveExistingPage}
          <p class="_hint">{$messages.pageMoveNeedsList}</p>
        {/if}
        <div class="_form-row">
          <div class="_form-field">
            <Label.Root for="page-mark">{$messages.pageKey}</Label.Root>
            <input id="page-mark" value={mark} required pattern="[A-Za-z][A-Za-z0-9]*"
              oninput={(event) => {
                manualMark = event.currentTarget.value;
                markEdited = true;
              }}
              readonly={workingPage !== null} disabled={locked} autocapitalize="none" spellcheck="false" />
          </div>
          <div class="_form-field">
            <Label.Root for="page-language">{$messages.pageLanguage}</Label.Root>
            <select id="page-language" bind:value={language}
              disabled={(locked || workingPage !== null) && !showingPublished}>
              {#each site.languages as item (item)}<option value={item}>{item}</option>{/each}
            </select>
          </div>
        </div>
        <div class="_form-field">
          {#if readOnly}
            <span id="page-content-label">{$messages.content}</span>
            <SitemapContent xml={options?.generatedContent ?? null} loading={optionsLoading} failed={optionsError} />
          {:else}
            <Label.Root for="page-content">{$messages.content}</Label.Root>
            <textarea id="page-content" bind:value={content} rows="12" disabled={locked}
              placeholder={isHtml ? $messages.markdownPlaceholder : $messages.rawContentPlaceholder}
              spellcheck={isHtml} aria-describedby="content-hint"></textarea>
          {/if}
          {#if !readOnly}<small id="content-hint">{#if isHtml}{$messages.markdownHint} {$messages.pageLinkHint}
            <code>[{$messages.linkText}]([[~12]])</code>{:else}{$messages.rawContentHint}{/if}</small>{/if}
        </div>
        {#if isHtml && editorTemplateId && can('cms.json-ld.list')}
          {#key site.siteId + ':' + editorTemplateId}
            <JsonLdAssignments siteId={site.siteId} templateId={editorTemplateId}
              canSave={can('cms.json-ld.save')} {onUnauthorized} />
          {/key}
        {/if}
        {#if !isHtml}{@render seoFields()}{/if}

        </div>
        {#if isHtml}
          <div class="cms-form _editor-panel" id={formId + '-seo-panel'} role="tabpanel"
            aria-labelledby={formId + '-seo-tab'} hidden={activeTab !== PageEditorTab.Seo}>
            {@render seoFields()}
          </div>
          <div class="cms-form _editor-panel" id={formId + '-openGraph-panel'} role="tabpanel"
            aria-labelledby={formId + '-openGraph-tab'} hidden={activeTab !== PageEditorTab.OpenGraph}>

          <p class="_setup-description">{$messages.openGraphHint}</p>
          <div class="_form-field">
            <Label.Root for="page-og-title">{$messages.openGraphTitle}</Label.Root>
            <input id="page-og-title" value={metadata.ogTitle ?? ''}
              oninput={(event) => metadata.ogTitle = event.currentTarget.value || null} />
          </div>

          <div class="_form-row">
            {#if can('cms.files.list')}
            <OpenGraphImageField siteId={site.siteId} value={metadata.ogImage}
              disabled={locked && !showingPublished} readonly={showingPublished}
              canReadContent={can('cms.files.read-content')} onChange={(url) => metadata.ogImage = url}
              onLibraryChange={(library) => tvEditor?.updateLibrary(library)} {onUnauthorized} />
            {:else}
              <div class="_form-field">
                <Label.Root for="page-og-image">{$messages.ogImage}</Label.Root>
                <input id="page-og-image" value={metadata.ogImage ?? ''} readonly
                  aria-describedby={canSave && !showingPublished ? 'page-og-image-list-hint' : undefined} />
                {#if canSave && !showingPublished}
                  <small id="page-og-image-list-hint">{$messages.ogImageNeedsFileList}</small>
                {/if}
              </div>
            {/if}
          <div class="_form-field">
            <Label.Root for="page-og-type">{$messages.openGraphType}</Label.Root>
            <select id="page-og-type" value={metadata.ogType ?? ''}
              onchange={(event) => metadata.ogType = event.currentTarget.value === OpenGraphType.Article
                ? OpenGraphType.Article
                : event.currentTarget.value === OpenGraphType.Website ? OpenGraphType.Website : null}>
              <option value="">{$messages.defaultOgType}</option>
              <option value={OpenGraphType.Website}>website</option>
              <option value={OpenGraphType.Article}>article</option>
            </select>
          </div>
          </div>
          <div class="_form-field">
            <Label.Root for="page-og-description">{$messages.openGraphDescription}</Label.Root>
            <textarea id="page-og-description" class="_page-metadata-description" rows="3"
              value={metadata.ogDescription ?? ''}
              oninput={(event) => metadata.ogDescription = event.currentTarget.value || null}></textarea>
          </div>

          </div>
        {/if}
        <div class="_editor-panel" id={formId + '-templateVariables-panel'}
          role={showEditorTabs ? 'tabpanel' : undefined}
          aria-labelledby={showEditorTabs ? formId + '-templateVariables-tab' : undefined}
          hidden={!showEditorTabs || activeTab !== PageEditorTab.TemplateVariables}>
          {#if isHtml && canShowTv}
          {#if hasTvFields && !showingPublished && !can('cms.template-variables.save-page')}
            <p class="_hint">{$messages.pageTvReadOnlyHint}</p>
          {/if}
          <PageTemplateVariables bind:this={tvEditor} siteId={site.siteId}
            templateId={editorTemplateId} bind:values={tvValues}
            disabled={locked && !showingPublished}
            readonly={showingPublished || !can('cms.template-variables.save-page')} {onUnauthorized}
            onStateChange={(hasFields, failed) => {
              hasTvFields = hasFields;
              tvLoadFailed = failed;
            }} />{/if}
        </div>
      </form>
    </section>
  </div>
</div>

<style>
  ._page-editor-scroll { scrollbar-gutter: stable; }
  @supports not (scrollbar-gutter: stable) {
    ._page-editor-scroll { overflow-y: scroll; }
  }
  ._page-field-group { border: 0; padding: 0; margin: 8px 0 24px; min-width: 0; }
  ._page-field-group legend { padding: 0; margin-bottom: 16px; font-size: 14px; font-weight: 600; line-height: 1.5; }
  ._editor-tabs { margin-bottom: 24px; }
  ._page-metadata-description { min-height: 104px; }
  ._page-cache-warning {
    margin: 0;
    padding: 10px 12px;
    border-radius: 6px;
    background: #fff6df;
    color: #6e4c10;
    font-size: 13px;
    line-height: 1.6;
  }
  ._editor-panel { min-width: 0; }
  ._editor-panel[hidden] { display: none; }
</style>
