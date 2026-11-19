/**
 * @filedesc `SurfaceApp` as a host sees it — the diagnostic channel, the
 * unmatched path, and the globals the binding is allowed to touch.
 *
 * The load-bearing test in this file is the first one. Divergence D4, the most
 * consequential in the register: the binding computed `planRoute` and
 * `planTransitions` diagnostics per route and **discarded** them, so the
 * majority of the closed code set surfaced only as on-page copy — unloggable,
 * unalarmable, uncountable, and gone the moment the route unmounted.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useState } from "react";
import { initFormspecEngine } from "@formspec-org/engine";
import {
  composeSurfaceApp,
  resolveSurfaceStrings,
  type PlannedTransition,
  type ResolvedBundle,
  type SurfaceStaticAssetResolver,
  type SurfaceDiagnostic,
} from "@formspec-org/surface";
import type {
  ExperienceDocument,
  FormDefinition,
  ResponseActionsDocument,
  SurfaceDocument,
  ThemeDocument,
} from "@formspec-org/types";
import { navigateAfterCompletedAction, SurfaceApp } from "../src/SurfaceApp.js";
import { starterWidgetModule } from "../src/widgets/index.js";
import { render, textOf } from "./render.js";

beforeAll(async () => {
  await initFormspecEngine();
});

const TENANT = "#7A1F3D";

const surface = {
  $formspecSurface: "0.2",
  id: "demo",
  entry: "noisy",
  routes: [
    {
      id: "noisy",
      path: "/noisy",
      title: "Noisy route",
      // No `routeClass`: THEME-UNCLASSIFIED-REFUSED is a per-route diagnostic
      // too, and it was equally invisible.
      slots: [
        {
          id: "seal",
          title: "Seal region",
          slotType: "static-content",
          binding: {
            kind: "image",
            content: "seal.png",
            alt: "Department emblem",
          },
        },
        {
          id: "decorative",
          slotType: "static-content",
          binding: { kind: "image", content: "rule.png", alt: "" },
        },
        {
          id: "missing-alt",
          title: "This title is not alternative text",
          slotType: "static-content",
          binding: { kind: "image", content: "unnamed.png" },
        },
        {
          id: "form",
          slotType: "definition-form",
          binding: { definitionRef: "urn:absent" },
        },
        {
          id: "w",
          slotType: "module-widget",
          binding: { moduleId: "x-chrome", widgetName: "ghost" },
        },
        { id: "e", slotType: "embed-route", binding: { routeRef: "nowhere" } },
        {
          id: "u",
          slotType: "experience-unit",
          binding: { unitRef: "absent" },
        },
        {
          id: "bad",
          slotType: "static-content",
          binding: { kind: "video", content: "x" },
        },
      ],
      transitions: [{ trigger: "submit", to: "noisy" }],
    },
  ],
} as unknown as SurfaceDocument;

const bundle: ResolvedBundle = {
  manifest: { $formspecBundle: "2.0", title: "Noisy release" },
  title: "Noisy release",
  surfaces: [surface],
  experiences: [
    { $formspecExperience: "1.0", units: [] } as unknown as ExperienceDocument,
  ],
  tenantTheme: {
    $formspecTheme: "1.0",
    tokens: { "color.primary": TENANT },
  } as unknown as ThemeDocument,
  registries: [],
  responseActions: [],
  definitions: new Map(),
  diagnostics: [],
};

function mount(overrides: Record<string, unknown> = {}) {
  const seen: SurfaceDiagnostic[][] = [];
  const container = render(
    <SurfaceApp
      bundle={bundle}
      location="/noisy"
      onNavigate={() => {}}
      widgetModules={[starterWidgetModule("x-chrome")]}
      onDiagnostics={(diagnostics) => seen.push([...diagnostics])}
      {...overrides}
    />
  );
  return {
    container,
    codes: () => (seen.at(-1) ?? []).map((d) => d.code),
    last: () => seen.at(-1) ?? [],
  };
}

describe("host navigation destinations", () => {
  it("respects a click already cancelled by another handler", () => {
    const onNavigate = vi.fn();
    const { container } = mount({ onNavigate });
    const anchor = container.querySelector<HTMLAnchorElement>('a[data-nav-route="noisy"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    event.preventDefault();
    act(() => anchor.dispatchEvent(event));
    expect(onNavigate).not.toHaveBeenCalled();
  });
  it.each(["ctrlKey", "metaKey", "shiftKey", "altKey"])("preserves native %s clicks on host destinations", modifier => {
    const onNavigate = vi.fn();
    const resolveNavigationHref = (href: string) => `${href}?retained=neutral`;
    const { container } = mount({ onNavigate, resolveNavigationHref });
    const anchor = container.querySelector<HTMLAnchorElement>('a[data-nav-route="noisy"]')!;
    const event = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, [modifier]: true });
    act(() => anchor.dispatchEvent(event));
    expect(anchor.getAttribute("href")).toBe("/noisy?retained=neutral");
    expect(event.defaultPrevented).toBe(false);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("keeps bare destinations when the host omits its resolver", () => {
    const onNavigate = vi.fn();
    const { container } = mount({ onNavigate });
    const anchor = container.querySelector<HTMLAnchorElement>('a[data-nav-route="noisy"]')!;
    expect(anchor.getAttribute("href")).toBe("/noisy");
    act(() => anchor.click());
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("/noisy");
  });
  it("renders the host link destination and retains the admitted callback route", () => {
    const navigationSurface = {
      $formspecSurface: "0.2", id: "navigation", entry: "start",
      routes: [
        { id: "start", path: "/start", title: "Start", slots: [] },
        { id: "review", path: "/review", title: "Review", slots: [] },
      ],
    } as unknown as SurfaceDocument;
    const onNavigate = vi.fn();
    const resolveNavigationHref = vi.fn((href: string) => `${href}?form=neutral&package=%2Fneutral.json`);
    const { container } = mount({
      bundle: { ...bundle, surfaces: [navigationSurface] }, location: "/start",
      onNavigate, resolveNavigationHref,
    });
    const review = container.querySelector<HTMLAnchorElement>('a[data-nav-route="review"]')!;
    expect(review.getAttribute("href")).toBe("/review?form=neutral&package=%2Fneutral.json");
    expect(container.querySelector('a[data-nav-route="start"]')?.getAttribute("aria-current")).toBe("page");
    expect(onNavigate).not.toHaveBeenCalled();
    act(() => review.click());
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith("/review");
  });
});

describe("generated Response Actions engine seam", () => {
  it("publishes host-owned current route state with a distinct route instance", () => {
    const firstDelivery = vi.fn();
    const { container: firstContainer } = mount({
      sessionGeneration: "session-route-state",
      onCurrentRouteStateChange: firstDelivery,
    });

    expect(firstDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        surface,
        surfaceId: "demo",
        routeId: "noisy",
        routeInstanceId: expect.any(String),
      })
    );
    const firstState = firstDelivery.mock.calls.find(
      ([state]) => state !== undefined
    )?.[0];
    firstContainer.remove();

    const secondDelivery = vi.fn();
    const { container: secondContainer } = mount({
      sessionGeneration: "session-route-state",
      onCurrentRouteStateChange: secondDelivery,
    });
    const secondState = secondDelivery.mock.calls.find(
      ([state]) => state !== undefined
    )?.[0];
    expect(secondState?.routeInstanceId).not.toBe(firstState?.routeInstanceId);
    secondContainer.remove();
  });

  it("runs a generated document through Surface React without a cast", async () => {
    const definitionUrl = "urn:test:surface-response-actions";
    const responseActions = {
      $formspecResponseActions: "1.0",
      version: "1.0.0",
      targetDefinition: { url: definitionUrl },
      actions: [
        {
          id: "submitApplication",
          intent: "submit",
          label: { literal: "Submit application" },
          effects: [{ type: "hostEvent", eventName: "formspec-submit" }],
        },
      ],
    } satisfies ResponseActionsDocument;
    const seamSurface = {
      $formspecSurface: "0.2",
      id: "seam",
      entry: "intake",
      routes: [
        {
          id: "intake",
          path: "/intake",
          title: "Intake",
          routeClass: "intake",
          slots: [
            {
              id: "form",
              slotType: "definition-form",
              binding: { definitionRef: definitionUrl },
            },
          ],
          transitions: [{ trigger: "submit", to: "receipt" }],
        },
        {
          id: "receipt",
          path: "/receipt",
          title: "Receipt",
          routeClass: "proof",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const seamDefinition = {
      $formspec: "1.0",
      url: definitionUrl,
      version: "1.0.0",
      title: "Application",
      items: [],
    } as unknown as FormDefinition;
    const seamBundle: ResolvedBundle = {
      manifest: { $formspecBundle: "2.2", title: "Seam test" },
      title: "Seam test",
      surfaces: [seamSurface],
      experiences: [],
      tenantTheme: undefined,
      registries: [],
      responseActions: [responseActions],
      definitions: new Map([[definitionUrl, seamDefinition]]),
      diagnostics: [],
    };
    const onNavigate = vi.fn();
    const onDefinitionActionResult = vi.fn();
    const container = render(
      <SurfaceApp
        bundle={seamBundle}
        location="/intake"
        onNavigate={onNavigate}
        onDefinitionActionResult={onDefinitionActionResult}
        setDocumentTitle={false}
      />
    );
    const submit = container.querySelector<HTMLButtonElement>(
      "button.formspec-submit"
    );

    expect(submit).not.toBeNull();
    await act(async () => {
      submit?.click();
      await Promise.resolve();
    });
    expect(onNavigate).toHaveBeenCalledWith("/receipt");
    expect(onDefinitionActionResult).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "completed",
        detail: expect.objectContaining({
          response: expect.objectContaining({
            definitionUrl,
            status: "completed",
          }),
        }),
      })
    );
  });
});

describe("every diagnostic reaches the host (§7.1, D4)", () => {
  it("delivers per-slot diagnostics to onDiagnostics, not only to the page", () => {
    const { codes } = mount();
    expect(codes()).toContain("STATIC-IMAGE-NO-ALT");
    expect(codes()).toContain("BUNDLE-DOCUMENT-MISSING");
    expect(codes()).toContain("WIDGET-UNDECLARED");
    expect(codes()).toContain("EMBED-ROUTE-UNRESOLVED");
    expect(codes()).toContain("EXPERIENCE-UNIT-UNRESOLVED");
    expect(codes()).toContain("STATIC-CONTENT-KIND-UNKNOWN");
  });

  it("delivers the theme-grant diagnostic", () => {
    expect(mount().codes()).toContain("THEME-UNCLASSIFIED-REFUSED");
  });

  it("delivers the transition diagnostic", () => {
    expect(mount().codes()).toContain("TRANSITION-UNFIREABLE");
  });

  it("gives the host a severity on every one of them", () => {
    // D3, at the channel a host actually reads.
    for (const diagnostic of mount().last()) {
      expect(diagnostic.severity).toMatch(/^(error|warning|info)$/);
    }
  });

  it("carries a document-vocabulary site, never a component-tree path", () => {
    const slotDiagnostic = mount()
      .last()
      .find((d) => d.code === "STATIC-IMAGE-NO-ALT");
    expect(slotDiagnostic?.site).toEqual({
      surfaceId: "demo",
      routeId: "noisy",
      slotId: "missing-alt",
    });
  });

  it("renders an authored image source unavailable until the host admits it", () => {
    const { container, codes } = mount();
    expect(codes()).toContain("STATIC-IMAGE-SOURCE-REFUSED");
    expect(container.querySelector(".fs-surface-static-image")).toBeNull();
    expect(
      container.querySelector(
        '[data-slot="seal"] [data-probe="slot-unavailable"]'
      )
    ).not.toBeNull();
  });

  it("renders only the image source returned by the host resolver", () => {
    const staticAssetResolver: SurfaceStaticAssetResolver = ({ source }) =>
      source === "seal.png" || source === "rule.png"
        ? { status: "admitted", source: `https://cdn.example.test/${source}` }
        : { status: "refused", reason: "origin-not-allowed" };
    const { container, codes } = mount({ staticAssetResolver });
    const image = container.querySelector<HTMLImageElement>(
      '[data-slot="seal"] .fs-surface-static-image'
    );
    const decorative = container.querySelector<HTMLImageElement>(
      '[data-slot="decorative"] .fs-surface-static-image'
    );

    expect(codes()).not.toContain("STATIC-IMAGE-SOURCE-REFUSED");
    expect(image?.getAttribute("src")).toBe(
      "https://cdn.example.test/seal.png"
    );
    expect(image?.getAttribute("src")).not.toBe("seal.png");
    expect(image?.getAttribute("alt")).toBe("Department emblem");
    expect(image?.getAttribute("alt")).not.toBe("Seal region");
    expect(decorative?.getAttribute("alt")).toBe("");
    expect(decorative?.getAttribute("role")).toBe("presentation");
    expect(
      container.querySelector(
        '[data-slot="missing-alt"] .fs-surface-static-image'
      )
    ).toBeNull();
  });
});

describe("diagnostic delivery", () => {
  it("settles after one delivery when equivalent inline inputs trigger a host update", () => {
    let deliveries = 0;
    let hostRenders = 0;

    function StateUpdatingHost() {
      const [, setRevision] = useState(0);
      hostRenders += 1;
      return (
        <SurfaceApp
          bundle={bundle}
          location="/noisy"
          onNavigate={() => {}}
          widgetModules={[starterWidgetModule("x-chrome")]}
          tokenAliases={{ "color.primary": ["brand.primary"] }}
          onDiagnostics={() => {
            deliveries += 1;
            // Bound the old failure mode so the regression fails without
            // hanging the test worker at React's maximum update depth.
            if (deliveries < 4) setRevision((value) => value + 1);
          }}
        />
      );
    }

    render(<StateUpdatingHost />);

    expect(deliveries).toBe(1);
    expect(hostRenders).toBe(2);
  });

  it("ignores object-key order but treats array order as semantic", () => {
    const firstDiagnostic: SurfaceDiagnostic = {
      code: "ROUTE-UNMATCHED",
      severity: "warning",
      message: "Stable diagnostic",
      site: { surfaceId: "demo", routeId: "noisy" },
      details: {
        alpha: 1,
        nested: { first: "x", second: "y" },
        sequence: [1, 2],
      },
    };
    const reorderedKeys: SurfaceDiagnostic = {
      message: "Stable diagnostic",
      severity: "warning",
      code: "ROUTE-UNMATCHED",
      site: { routeId: "noisy", surfaceId: "demo" },
      details: {
        sequence: [1, 2],
        nested: { second: "y", first: "x" },
        alpha: 1,
      },
    };
    const reorderedArray: SurfaceDiagnostic = {
      ...reorderedKeys,
      details: {
        sequence: [2, 1],
        nested: { second: "y", first: "x" },
        alpha: 1,
      },
    };
    const bundles = [
      { ...bundle, diagnostics: [firstDiagnostic] },
      { ...bundle, diagnostics: [reorderedKeys] },
      { ...bundle, diagnostics: [reorderedArray] },
    ] satisfies readonly ResolvedBundle[];
    const delivered: SurfaceDiagnostic[][] = [];

    function Host() {
      const [index, setIndex] = useState(0);
      return (
        <>
          <button
            data-probe="next-diagnostic"
            onClick={() => setIndex((value) => value + 1)}
          >
            Next
          </button>
          <SurfaceApp
            bundle={bundles[index] ?? bundles[0]}
            location="/noisy"
            onNavigate={() => {}}
            onDiagnostics={(diagnostics) => delivered.push([...diagnostics])}
          />
        </>
      );
    }

    const container = render(<Host />);
    const next = container.querySelector<HTMLButtonElement>(
      '[data-probe="next-diagnostic"]'
    );
    expect(next).not.toBeNull();
    expect(delivered).toHaveLength(1);

    act(() => next?.click());
    expect(delivered).toHaveLength(1);

    act(() => next?.click());
    expect(delivered).toHaveLength(2);
    expect(delivered.at(-1)?.[0]?.details).toMatchObject({ sequence: [2, 1] });
  });

  it("does not replay for callback replacement and sends the next change to the replacement", () => {
    const first = vi.fn();
    const replacement = vi.fn();

    function Host() {
      const [useReplacement, setUseReplacement] = useState(false);
      const [location, setLocation] = useState("/noisy");
      return (
        <>
          <button
            data-probe="replace-callback"
            onClick={() => setUseReplacement(true)}
          >
            Replace
          </button>
          <button
            data-probe="change-location"
            onClick={() => setLocation("/nowhere")}
          >
            Change
          </button>
          <SurfaceApp
            bundle={bundle}
            location={location}
            onNavigate={() => {}}
            onDiagnostics={useReplacement ? replacement : first}
          />
        </>
      );
    }

    const container = render(<Host />);
    expect(first).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-probe="replace-callback"]')
        ?.click();
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(replacement).not.toHaveBeenCalled();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-probe="change-location"]')
        ?.click();
    });
    expect(first).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(
      (replacement.mock.calls[0]?.[0] as readonly SurfaceDiagnostic[]).map(
        (diagnostic) => diagnostic.code
      )
    ).toContain("ROUTE-UNMATCHED");
  });

  it("delivers the current list once for each new subscription", () => {
    const onDiagnostics = vi.fn();

    function Host() {
      const [subscribed, setSubscribed] = useState(false);
      return (
        <>
          <button
            data-probe="toggle-subscription"
            onClick={() => setSubscribed((value) => !value)}
          >
            Toggle
          </button>
          <SurfaceApp
            bundle={bundle}
            location="/noisy"
            onNavigate={() => {}}
            onDiagnostics={subscribed ? onDiagnostics : undefined}
          />
        </>
      );
    }

    const container = render(<Host />);
    const toggle = container.querySelector<HTMLButtonElement>(
      '[data-probe="toggle-subscription"]'
    );
    expect(onDiagnostics).not.toHaveBeenCalled();

    act(() => toggle?.click());
    expect(onDiagnostics).toHaveBeenCalledTimes(1);

    act(() => toggle?.click());
    expect(onDiagnostics).toHaveBeenCalledTimes(1);

    act(() => toggle?.click());
    expect(onDiagnostics).toHaveBeenCalledTimes(2);
  });

  it("delivers one initial list per logical StrictMode mount", () => {
    const onDiagnostics = vi.fn();
    render(
      <StrictMode>
        <SurfaceApp
          bundle={bundle}
          location="/noisy"
          onNavigate={() => {}}
          onDiagnostics={onDiagnostics}
        />
      </StrictMode>
    );
    expect(onDiagnostics).toHaveBeenCalledTimes(1);
  });
});

describe("an unmatched path (§2.6, D5)", () => {
  it("reports ROUTE-UNMATCHED to the host", () => {
    const { codes } = mount({ location: "/nowhere" });
    expect(codes()).toContain("ROUTE-UNMATCHED");
  });

  it("renders no route content and never redirects to the entry route", () => {
    const { container } = mount({ location: "/nowhere" });
    expect(container.querySelector("[data-route]")).toBeNull();
    expect(
      container.querySelector('[data-probe="route-not-found"]')
    ).not.toBeNull();
  });

  it("lets the host present the unmatched state", () => {
    const { container } = mount({
      location: "/nowhere",
      renderNotFound: (path: string) => <p data-probe="host-404">{path}</p>,
    });
    expect(textOf(container.querySelector('[data-probe="host-404"]'))).toBe(
      "/nowhere"
    );
  });

  it("takes its own not-found wording from the host string table", () => {
    const { container } = mount({
      location: "/nowhere",
      strings: resolveSurfaceStrings({ notFoundTitle: "Adres bulunamadı." }),
    });
    expect(
      textOf(container.querySelector('[data-probe="route-not-found"] h1'))
    ).toBe("Adres bulunamadı.");
  });
});

describe("the document root (§4.5, D7)", () => {
  it("says nothing when the root is clean", () => {
    expect(mount().codes()).not.toContain("THEME-DOCUMENT-ROOT-CONTAMINATED");
  });

  it("REPORTS a contaminated root rather than scrubbing it", () => {
    document.documentElement.style.setProperty(
      "--formspec-color-primary",
      TENANT
    );
    const { codes } = mount();
    expect(codes()).toContain("THEME-DOCUMENT-ROOT-CONTAMINATED");
    // Reported, not repaired: a shell that manufactures the property it reports
    // is not measuring anything, and the leak stays broken for every consumer
    // that is not this shell.
    expect(
      document.documentElement.style.getPropertyValue(
        "--formspec-color-primary"
      )
    ).toBe(TENANT);
  });
});

describe("document.title (§8.3 item 9, D16)", () => {
  it("sets it from the bundle", () => {
    document.title = "Host page";
    mount();
    expect(document.title).toBe("Noisy release");
  });

  it("RESTORES the previous title on unmount", () => {
    document.title = "Host page";
    const container = render(
      <SurfaceApp bundle={bundle} location="/noisy" onNavigate={() => {}} />
    );
    expect(document.title).toBe("Noisy release");
    act(() => {
      container.remove();
    });
  });

  it("writes nothing when the host declines", () => {
    document.title = "Host page";
    mount({ setDocumentTitle: false });
    expect(document.title).toBe("Host page");
  });
});

describe("navigation", () => {
  it("names the navigation landmark from the string table", () => {
    const { container } = mount({
      strings: resolveSurfaceStrings({
        navigationLabel: "Bu uygulamadaki sayfalar",
      }),
    });
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Bu uygulamadaki sayfalar"
    );
  });

  it("lets an explicit navigationLabel win", () => {
    const { container } = mount({ navigationLabel: "Sections" });
    expect(container.querySelector("nav")?.getAttribute("aria-label")).toBe(
      "Sections"
    );
  });

  it("renders a compact navigation disclosure with direct Need identity", () => {
    const tracedSurface = {
      ...surface,
      routes: surface.routes.map((route) => ({
        ...route,
        "x-generation": { anchors: ["need:navigate-app@1"] },
      })),
    } as unknown as SurfaceDocument;
    const { container } = mount({
      bundle: { ...bundle, surfaces: [tracedSurface] },
    });
    const toggle = container.querySelector<HTMLButtonElement>(
      ".fs-surface-nav__toggle"
    );

    expect(toggle?.textContent).toContain("Pages in this app");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.hasAttribute("data-need-ids")).toBe(true);

    act(() => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
  });

  it("separates workspace and public navigation while preserving Surface groups and route order", () => {
    const casesSurface = {
      $formspecSurface: "0.2",
      id: "cases",
      title: "Cases",
      entry: "workspace-home",
      routes: [
        {
          id: "workspace-home",
          path: "/workspace",
          navigation: {
            scope: "workspace",
            label: "Workspace home",
            order: 20,
          },
          slots: [],
        },
        {
          id: "workspace-queue",
          path: "/workspace/queue",
          navigation: { scope: "workspace", label: "Queue", order: 10 },
          slots: [],
        },
        {
          id: "public-about",
          path: "/about",
          navigation: { scope: "public", label: "About" },
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const accountSurface = {
      $formspecSurface: "0.2",
      id: "account",
      title: "Account",
      entry: "workspace-settings",
      routes: [
        {
          id: "workspace-settings",
          path: "/workspace/settings",
          navigation: { scope: "workspace", label: "Settings" },
          slots: [],
        },
        {
          id: "public-help",
          path: "/help",
          navigation: { scope: "public", label: "Help" },
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const scopedBundle = {
      ...bundle,
      surfaces: [casesSurface, accountSurface],
    };

    const workspace = mount({
      bundle: scopedBundle,
      location: "/workspace",
    }).container;
    const workspaceGroups = [
      ...workspace.querySelectorAll<HTMLElement>(".fs-surface-nav__group"),
    ];
    expect(
      workspace.querySelector("nav")?.getAttribute("data-navigation-scope")
    ).toBe("workspace");
    expect(
      workspaceGroups.map((group) =>
        textOf(group.querySelector(".fs-surface-nav__label"))
      )
    ).toEqual(["Cases", "Account"]);
    expect(
      [...workspace.querySelectorAll<HTMLElement>("[data-nav-route]")].map(
        (link) => link.textContent
      )
    ).toEqual(["Queue", "Workspace home", "Settings"]);
    expect(
      workspace.querySelector('[data-nav-route="public-about"]')
    ).toBeNull();
    expect(
      workspace.querySelector('[data-nav-route="public-help"]')
    ).toBeNull();

    const publicPage = mount({
      bundle: scopedBundle,
      location: "/about",
    }).container;
    expect(
      publicPage.querySelector("nav")?.getAttribute("data-navigation-scope")
    ).toBe("public");
    expect(
      [...publicPage.querySelectorAll<HTMLElement>("[data-nav-route]")].map(
        (link) => link.textContent
      )
    ).toEqual(["About", "Help"]);
    expect(
      publicPage.querySelector('[data-nav-route="workspace-home"]')
    ).toBeNull();
    expect(
      publicPage.querySelector('[data-nav-route="workspace-queue"]')
    ).toBeNull();
    expect(
      publicPage.querySelector('[data-nav-route="workspace-settings"]')
    ).toBeNull();
  });

  it("keeps routes without navigation.scope in the legacy default scope", () => {
    const legacySurface = {
      $formspecSurface: "0.2",
      id: "legacy",
      entry: "home",
      routes: [
        { id: "home", path: "/home", title: "Home", slots: [] },
        {
          id: "reports",
          path: "/reports",
          navigation: { label: "Reports" },
          slots: [],
        },
        {
          id: "workspace",
          path: "/workspace",
          navigation: { scope: "workspace", label: "Workspace" },
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const { container } = mount({
      bundle: { ...bundle, surfaces: [legacySurface] },
      location: "/home",
    });

    expect(
      container.querySelector("nav")?.getAttribute("data-navigation-scope")
    ).toBe("default");
    expect(
      [...container.querySelectorAll<HTMLElement>("[data-nav-route]")].map(
        (link) => link.dataset.navRoute
      )
    ).toEqual(["home", "reports"]);
    expect(container.querySelector('[data-nav-route="workspace"]')).toBeNull();
  });

  it("renders no navigation landmark when the active scope has no visible entries", () => {
    const isolatedSurface = {
      $formspecSurface: "0.2",
      id: "isolated",
      entry: "public-landing",
      routes: [
        {
          id: "public-landing",
          path: "/welcome",
          navigation: { scope: "public", visible: false },
          slots: [],
        },
        {
          id: "workspace-case",
          path: "/case/{caseId}",
          params: [{ name: "caseId", type: "string" }],
          navigation: { scope: "workspace", label: "Case" },
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const { container, codes } = mount({
      bundle: { ...bundle, surfaces: [isolatedSurface] },
      location: "/welcome",
    });

    expect(container.querySelector("nav")).toBeNull();
    expect(codes()).not.toContain("ROUTE-PARAM-UNSUPPLIED");
  });

  it("renders only authored navigation members in authored order with Need trace identity", () => {
    const navigationSurface = {
      $formspecSurface: "0.2",
      id: "navigation",
      entry: "home",
      routes: [
        {
          id: "home",
          path: "/home",
          title: "Home title",
          "x-generation": { anchors: ["need:overview@1"] },
          navigation: {
            label: "Overview",
            order: 20,
            "x-generation": { anchors: ["need:overview@1"] },
          },
          slots: [
            {
              id: "summary",
              slotType: "static-content",
              binding: { kind: "text", content: "Summary" },
              "x-generation": { anchors: ["need:overview@1"] },
            },
          ],
          transitions: [
            {
              trigger: "openSettings",
              to: "settings",
              "x-generation": { anchors: ["need:configure@2"] },
            },
          ],
        },
        {
          id: "settings",
          path: "/settings",
          title: "Settings",
          "x-generation": { anchors: ["need:settings-title@1"] },
          navigation: {
            order: 10,
            "x-generation": { anchors: ["need:configure@2"] },
          },
          slots: [],
        },
        {
          id: "private",
          path: "/private/{accountId}",
          title: "Private",
          params: [{ name: "accountId", type: "string" }],
          navigation: { visible: false },
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const { container, codes } = mount({
      bundle: {
        ...bundle,
        manifest: {
          ...bundle.manifest,
          "x-generation": { anchors: ["need:overview@1"] },
        },
        surfaces: [navigationSurface],
      },
      location: "/home",
    });
    const links = [
      ...container.querySelectorAll<HTMLAnchorElement>("[data-nav-route]"),
    ];

    expect(links.map((link) => link.textContent)).toEqual([
      "Settings",
      "Overview",
    ]);
    expect(links.map((link) => link.dataset.navRoute)).toEqual([
      "settings",
      "home",
    ]);
    expect(
      container.querySelector("nav")?.getAttribute("data-navigation-scope")
    ).toBe("default");
    expect(container.querySelector('[data-nav-route="private"]')).toBeNull();
    expect(codes()).not.toContain("ROUTE-PARAM-UNSUPPLIED");
    expect(links[0]?.getAttribute("data-need-anchors")).toBe(
      "need:configure@2 need:settings-title@1"
    );
    expect(links[0]?.getAttribute("data-need-ids")).toBe(
      "configure settings-title"
    );
    expect(links[1]?.getAttribute("data-need-anchors")).toBe("need:overview@1");
    expect(
      container.querySelector(".fs-surface-app")?.getAttribute("data-need-ids")
    ).toBe("overview");
    expect(
      container
        .querySelector('[data-route="home"]')
        ?.getAttribute("data-need-ids")
    ).toBe("overview");
    expect(
      container
        .querySelector('[data-slot="summary"]')
        ?.getAttribute("data-need-ids")
    ).toBe("overview");
    expect(
      container
        .querySelector('[data-transition-status="unfireable"]')
        ?.getAttribute("data-need-ids")
    ).toBe("configure");
  });

  it("does not synthesize a transition control without a host executor", () => {
    // §5.1: no synthesized Continue, Next, or Submit control, under any label,
    // on any route.
    const { container } = mount();
    expect(
      container.querySelector('[data-probe="transition-fireable"]')
    ).toBeNull();
    expect(
      container.querySelector(".fs-surface-transition__button")
    ).toBeNull();
  });

  it("renders a control only once the trigger resolves AND the host supplies an executor", () => {
    // "Supplying the executor is the host asking", which is what makes this not
    // a default affordance (§5.3). Both halves are required: with no Response
    // Actions document the trigger resolves against nothing.
    const onFireTransition = vi.fn(async () => ({ advanced: false }));
    expect(
      mount({ onFireTransition }).container.querySelector(
        ".fs-surface-transition__button"
      )
    ).toBeNull();

    const withActions = {
      ...bundle,
      responseActions: [
        { actions: [{ id: "submitApplication", intent: "submit" }] },
      ],
    };
    const { container } = mount({ bundle: withActions, onFireTransition });
    expect(
      container.querySelector(".fs-surface-transition__button")
    ).not.toBeNull();
    expect(onFireTransition).not.toHaveBeenCalled();
  });

  it("keeps parameters parsed from the matched route through completed-action navigation", async () => {
    const parameterSurface = {
      $formspecSurface: "0.2",
      id: "cases",
      entry: "case",
      routes: [
        {
          id: "case",
          path: "/case/{caseRef}",
          params: [{ name: "caseRef", type: "string" }],
          title: "Case",
          routeClass: "operation",
          slots: [],
          transitions: [{ trigger: "submit", to: "receipt" }],
        },
        {
          id: "receipt",
          path: "/receipt/{caseRef}",
          params: [{ name: "caseRef", type: "string" }],
          title: "Receipt",
          routeClass: "operation",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const parameterBundle = {
      ...bundle,
      surfaces: [parameterSurface],
      responseActions: [
        { actions: [{ id: "submitApplication", intent: "submit" }] },
      ],
    };
    const onFireTransition = vi.fn(async () => ({ advanced: true }));
    const onNavigate = vi.fn();
    const { container } = mount({
      bundle: parameterBundle,
      location: "/case/CASE-42",
      onFireTransition,
      onNavigate,
    });
    const transition = container.querySelector<HTMLButtonElement>(
      ".fs-surface-transition__button"
    );

    expect(transition).not.toBeNull();
    await act(async () => {
      transition?.click();
      await Promise.resolve();
    });

    expect(onFireTransition).toHaveBeenCalledOnce();
    expect(onFireTransition).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        routeId: "case",
        params: { caseRef: "CASE-42" },
      })
    );
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/receipt/CASE-42");
  });

  it("carries the current public form id from a completed Definition action into review", async () => {
    const definitionUrl = "urn:test:public-response";
    const action = {
      id: "submitResponse",
      intent: "submit",
      label: { literal: "Review response" },
      effects: [{ type: "hostEvent", eventName: "formspec-submit" }],
    };
    const parameterSurface = {
      $formspecSurface: "0.2",
      id: "public-form",
      entry: "publicRespond",
      routes: [
        {
          id: "publicRespond",
          path: "/public/forms/{formId}/respond",
          params: [{ name: "formId", type: "string" }],
          routeClass: "intake",
          slots: [
            {
              id: "response",
              slotType: "definition-form",
              binding: { definitionRef: definitionUrl },
            },
          ],
          transitions: [
            {
              trigger: "submitResponse",
              to: "publicReview",
              params: { formId: "formId" },
            },
          ],
        },
        {
          id: "publicReview",
          path: "/public/forms/{formId}/review",
          params: [{ name: "formId", type: "string" }],
          routeClass: "intake",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const parameterBundle: ResolvedBundle = {
      ...bundle,
      surfaces: [parameterSurface],
      responseActions: [
        {
          $formspecResponseActions: "1.0",
          version: "1.0.0",
          targetDefinition: { url: definitionUrl },
          actions: [action],
        } as ResponseActionsDocument,
      ],
      definitions: new Map([
        [
          definitionUrl,
          {
            $formspec: "1.0",
            url: definitionUrl,
            version: "1.0.0",
            title: "Public response",
            items: [],
          } as unknown as FormDefinition,
        ],
      ]),
    };
    const onNavigate = vi.fn();
    const container = render(
      <SurfaceApp
        bundle={parameterBundle}
        location="/public/forms/community-intake/respond"
        onNavigate={onNavigate}
        renderDefinitionForm={({ onActionCompleted }) => (
          <button
            data-probe="complete-definition"
            onClick={() => onActionCompleted?.(
              action,
              {
                status: "completed",
                resolution: { resolved: true, action },
                validationTuple: null,
                detail: {
                  response: {},
                  validationReport: { valid: true },
                },
                effectTrace: [],
              } as never
            )}
          >
            Review
          </button>
        )}
        setDocumentTitle={false}
      />
    );

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-probe="complete-definition"]')
        ?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "/public/forms/community-intake/review"
    );
  });

  it("uses only allowlisted completed-action bindings for authored transition parameters", async () => {
    const parameterSurface = {
      $formspecSurface: "0.2",
      id: "forms",
      entry: "list",
      routes: [
        {
          id: "list",
          path: "/forms",
          title: "Forms",
          routeClass: "operation",
          slots: [],
          transitions: [
            {
              trigger: "createForm",
              to: "detail",
              params: { formId: "createdFormId" },
            },
          ],
        },
        {
          id: "detail",
          path: "/forms/{formId}",
          params: [{ name: "formId", type: "string" }],
          title: "Form",
          routeClass: "operation",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const parameterBundle = {
      ...bundle,
      surfaces: [parameterSurface],
      responseActions: [
        { actions: [{ id: "createForm", intent: "submit" }] },
      ],
    };
    const onFireTransition = vi.fn(async () => ({
      advanced: true,
      transitionBindings: { createdFormId: "form-created-by-server" },
    }));
    const onNavigate = vi.fn();
    const { container } = mount({
      bundle: parameterBundle,
      location: "/forms",
      routeParams: { formId: "stale-example" },
      onFireTransition,
      onNavigate,
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>(".fs-surface-transition__button")
        ?.click();
      await Promise.resolve();
    });

    expect(onNavigate).toHaveBeenCalledWith(
      "/forms/form-created-by-server"
    );
  });

  it("refuses result-driven navigation when an authored binding is absent", () => {
    const target = composeSurfaceApp([
      {
        $formspecSurface: "0.2",
        id: "forms",
        entry: "detail",
        routes: [
          {
            id: "detail",
            path: "/forms/{formId}",
            params: [{ name: "formId", type: "string" }],
            slots: [],
          },
        ],
      } as unknown as SurfaceDocument,
    ]).routes[0]!;
    const transition: PlannedTransition = {
      trigger: "createForm",
      to: "detail",
      params: { formId: "createdFormId" },
      status: "fireable",
      reason: "ready",
      actionId: "createForm",
      target,
    };
    const onNavigate = vi.fn();

    expect(
      navigateAfterCompletedAction(transition, {}, {}, onNavigate)
    ).toBe("refused");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("reports whether the browser accepted a completed action's departure", async () => {
    const target = composeSurfaceApp([{
      $formspecSurface: "0.2", id: "staff", entry: "queue",
      routes: [{ id: "queue", path: "/queue", slots: [] }],
    } as SurfaceDocument]).entry!;
    const transition: PlannedTransition = {
      trigger: "submit", to: "queue", actionId: "submit", status: "fireable", reason: "ready", target,
    };
    const depart = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await navigateAfterCompletedAction(transition, {}, undefined, depart)).toBe("refused");
    expect(await navigateAfterCompletedAction(transition, {}, undefined, depart)).toBe("advanced");
  });

  it("does not fire a transition whose target URL is collision-refused", () => {
    const collisionSource = {
      $formspecSurface: "0.2",
      id: "staff",
      entry: "start",
      routes: [
        {
          id: "start",
          path: "/start",
          title: "Start",
          routeClass: "operation",
          slots: [],
          transitions: [{ trigger: "submit", to: "queue" }],
        },
        {
          id: "queue",
          path: "/queue",
          title: "Staff queue",
          routeClass: "operation",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const collisionClaimant = {
      $formspecSurface: "0.2",
      id: "oversight",
      entry: "queue",
      routes: [
        {
          id: "queue",
          path: "/queue",
          title: "Oversight queue",
          routeClass: "operation",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const collisionBundle = {
      ...bundle,
      surfaces: [collisionSource, collisionClaimant],
      responseActions: [
        { actions: [{ id: "submitApplication", intent: "submit" }] },
      ],
    };
    const onFireTransition = vi.fn(async () => ({ advanced: true }));
    const { container, codes } = mount({
      bundle: collisionBundle,
      location: "/start",
      onFireTransition,
    });

    expect(codes()).toContain("TRANSITION-UNFIREABLE");
    expect(
      container.querySelector(".fs-surface-transition__button")
    ).toBeNull();
    expect(onFireTransition).not.toHaveBeenCalled();
  });

  it("rechecks a collision-refused target after an adversarial completed action", () => {
    const collisionSource = {
      $formspecSurface: "0.2",
      id: "staff",
      entry: "start",
      routes: [
        {
          id: "start",
          path: "/start",
          title: "Start",
          routeClass: "operation",
          slots: [],
        },
        {
          id: "queue",
          path: "/queue",
          title: "Staff queue",
          routeClass: "operation",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const collisionClaimant = {
      $formspecSurface: "0.2",
      id: "oversight",
      entry: "queue",
      routes: [
        {
          id: "queue",
          path: "/queue",
          title: "Oversight queue",
          routeClass: "operation",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const app = composeSurfaceApp([collisionSource, collisionClaimant]);
    const target = app.routes.find(
      (handle) => handle.surfaceId === "staff" && handle.routeId === "queue"
    );
    if (!target) throw new Error("Expected the staff queue route.");
    expect(target?.pathCollides).toBe(true);

    // Deliberately bypass the planner's first defense. This models a stale or
    // hostile completed-action path handing the final boundary a transition it
    // must still refuse.
    const transition: PlannedTransition = {
      trigger: "submit",
      to: "queue",
      status: "fireable",
      reason: "Adversarial test transition.",
      actionId: "submitApplication",
      target,
    };
    const onNavigate = vi.fn();

    expect(navigateAfterCompletedAction(transition, {}, onNavigate)).toBe(
      "refused"
    );
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("reports an unsupplied navigation parameter and renders no marker-bearing link", () => {
    const parameterSurface = {
      ...surface,
      routes: [
        ...surface.routes,
        {
          id: "receipt",
          path: "/receipt/{caseRef}",
          params: [{ name: "caseRef", type: "string" }],
          title: "Receipt",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const parameterBundle = { ...bundle, surfaces: [parameterSurface] };
    const onNavigate = vi.fn();
    const resolveNavigationHref = vi.fn((href: string) => href);
    const { container, codes } = mount({ bundle: parameterBundle, onNavigate, resolveNavigationHref });

    expect(codes()).toContain("ROUTE-PARAM-UNSUPPLIED");
    expect(container.querySelector('a[href*="{caseRef}"]')).toBeNull();
    const unavailable = container.querySelector('[data-nav-route="receipt"]');
    expect(unavailable?.tagName).toBe("SPAN");
    expect(unavailable?.getAttribute("aria-disabled")).toBe("true");
    expect(resolveNavigationHref).not.toHaveBeenCalledWith(expect.stringContaining("receipt"));
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders every collision claimant as unavailable while preserving other links", () => {
    const firstSurface = {
      $formspecSurface: "0.2",
      id: "first",
      entry: "shared-first",
      routes: [
        {
          id: "shared-first",
          path: "/shared",
          title: "First claimant",
          routeClass: "intake",
          slots: [],
        },
        {
          id: "unique",
          path: "/unique",
          title: "Unique route",
          routeClass: "intake",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const secondSurface = {
      $formspecSurface: "0.2",
      id: "second",
      entry: "shared-second",
      routes: [
        {
          id: "shared-second",
          path: "/shared",
          title: "Second claimant",
          routeClass: "intake",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;
    const collisionBundle = {
      ...bundle,
      surfaces: [firstSurface, secondSurface],
    };
    const onNavigate = vi.fn();
    const resolveNavigationHref = vi.fn((href: string) => href);
    const { container, last } = mount({
      bundle: collisionBundle,
      location: "/shared",
      onNavigate,
      resolveNavigationHref,
    });

    expect(
      last().filter((diagnostic) => diagnostic.code === "ROUTE-PATH-COLLISION")
    ).toHaveLength(1);
    const unavailable = container.querySelectorAll(
      '[data-nav-unavailable="route-collision"]'
    );
    expect(unavailable).toHaveLength(2);
    expect([...unavailable].map((item) => item.textContent)).toEqual([
      "First claimant",
      "Second claimant",
    ]);
    for (const item of unavailable) {
      expect(item.tagName).toBe("SPAN");
      expect(item.getAttribute("role")).toBe("link");
      expect(item.getAttribute("aria-disabled")).toBe("true");
      expect(item.getAttribute("tabindex")).toBeNull();
    }
    expect(container.querySelector('a[href="/shared"]')).toBeNull();
    expect(resolveNavigationHref).not.toHaveBeenCalledWith("/shared");
    expect(resolveNavigationHref).toHaveBeenCalledWith("/unique");

    const unique =
      container.querySelector<HTMLAnchorElement>('a[href="/unique"]');
    expect(unique).not.toBeNull();
    act(() => unique?.click());
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/unique");
  });

  it("reports background autosave completion on a Surface without a draft writer while requiring control activation before advancing the route", async () => {
    vi.useFakeTimers();
    try {
      const { initFormspecEngine } = await import("@formspec-org/engine");
      await initFormspecEngine();

      const definitionUrl = "urn:test:surface-no-writer-autosave";
      const filingSurface = {
        $formspecSurface: "0.2",
        id: "filing-surface",
        entry: "filing",
        routes: [
          {
            id: "filing",
            path: "/filing",
            title: "Filing",
            routeClass: "intake",
            slots: [
              {
                id: "form",
                slotType: "definition-form",
                binding: { definitionRef: definitionUrl },
              },
            ],
            transitions: [{ trigger: "autosave", to: "overview" }],
          },
          {
            id: "overview",
            path: "/overview",
            title: "Overview",
            routeClass: "intake",
            slots: [],
          },
        ],
      } as unknown as SurfaceDocument;

      const noWriterBundle: ResolvedBundle = {
        ...bundle,
        surfaces: [filingSurface],
        responseActions: [
          {
            $formspecResponseActions: "1.0",
            version: "1.0.0",
            targetDefinition: { url: definitionUrl },
            actions: [
              {
                id: "autosave",
                intent: "autosave",
                label: { literal: "Autosave" },
                effects: [{ type: "hostEvent", eventName: "draft-autosaved" }],
              },
            ],
          } as ResponseActionsDocument,
        ],
        definitions: new Map([
          [
            definitionUrl,
            {
              $formspec: "1.0",
              url: definitionUrl,
              version: "1.0.0",
              title: "Filing",
              items: [
                { key: "answer", type: "field", dataType: "string", label: "Answer" },
              ],
            } as unknown as FormDefinition,
          ],
        ]),
      };

      const onNavigate = vi.fn();
      const onDefinitionActionResult = vi.fn();
      const container = render(
        <SurfaceApp
          bundle={noWriterBundle}
          location="/filing"
          onNavigate={onNavigate}
          onDefinitionActionResult={onDefinitionActionResult}
          resolveDefinitionComponent={() =>
            ({
              $formspecComponent: "1.0",
              version: "1.0.0",
              targetDefinition: { url: definitionUrl },
              tree: {
                component: "Stack",
                children: [
                  { component: "TextInput", bind: "answer" },
                  {
                    component: "ActionButton",
                    actionRef: "autosave",
                    label: { literal: "Checkpoint now" },
                  },
                ],
              },
            }) as never
          }
          setDocumentTitle={false}
        />,
      );

      const input = container.querySelector<HTMLInputElement>('input[type="text"]');
      expect(input).not.toBeNull();
      const nativeValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      await act(async () => {
        nativeValueSetter?.call(input, "typing only");
        input!.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(900);
      });

      // Background autosave still reports its result to observers, but MUST NOT advance the route!
      expect(onDefinitionActionResult).toHaveBeenCalledTimes(1);
      expect(onNavigate).not.toHaveBeenCalled();

      // Clicking the explicitly authored control DOES advance the route.
      const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
        (candidate) => candidate.textContent === "Checkpoint now",
      );
      expect(button).toBeDefined();
      await act(async () => {
        button!.click();
        await Promise.resolve();
      });
      expect(onNavigate).toHaveBeenCalledOnce();
      expect(onNavigate).toHaveBeenCalledWith("/overview");
    } finally {
      vi.useRealTimers();
    }
  });

  it("forwards one ambiguous-autosave-action finding through Surface diagnostics with and without draft storage", async () => {
    const { initFormspecEngine } = await import("@formspec-org/engine/init-formspec-engine");
    const { BrowserSurfaceApp } = await import("../src/BrowserSurfaceApp.js");
    await initFormspecEngine();

    const definitionUrl = "https://example.test/filing-ambiguous";
    const filingSurface = {
      $formspecSurface: "0.2",
      id: "filing",
      entry: "filing",
      routes: [
        {
          id: "filing",
          path: "/filing",
          title: "Filing",
          routeClass: "intake",
          slots: [
            {
              id: "form",
              slotType: "definition-form",
              binding: { definitionRef: definitionUrl },
            },
          ],
        },
      ],
    } as unknown as SurfaceDocument;

    const ambiguousBundle: ResolvedBundle = {
      ...bundle,
      surfaces: [filingSurface],
      responseActions: [
        {
          $formspecResponseActions: "1.0",
          version: "1.0.0",
          targetDefinition: { url: definitionUrl },
          actions: [
            {
              id: "first-auto",
              intent: "autosave",
              effects: [{ type: "hostEvent", eventName: "first" }],
            },
            {
              id: "second-auto",
              intent: "autosave",
              effects: [{ type: "hostEvent", eventName: "second" }],
            },
          ],
        } as ResponseActionsDocument,
      ],
      definitions: new Map([
        [
          definitionUrl,
          {
            $formspec: "1.0",
            url: definitionUrl,
            version: "1.0.0",
            title: "Filing",
            items: [{ key: "answer", type: "field", dataType: "string", label: "Answer" }],
          } as unknown as FormDefinition,
        ],
      ]),
    };

    // 1. Without draft writer (`SurfaceApp`)
    const withoutWriterBatches: SurfaceDiagnostic[][] = [];
    await act(async () => {
      render(
        <SurfaceApp
          bundle={ambiguousBundle}
          location="/filing"
          onNavigate={() => {}}
          onDiagnostics={(batch) => withoutWriterBatches.push([...batch])}
          setDocumentTitle={false}
        />,
      );
    });
    const withoutWriterMatches = (withoutWriterBatches.at(-1) ?? []).filter(
      (diag) => diag.details?.reason === "ambiguous-autosave-action",
    );
    expect(withoutWriterMatches).toHaveLength(1);
    expect(withoutWriterMatches[0]?.code).toBe("BUNDLE-DOCUMENT-SHAPE");

    // 2. With draft writer (`BrowserSurfaceApp` + `draftStorage`)
    const withWriterBatches: SurfaceDiagnostic[][] = [];
    const draftStorage = {
      scope: "ambiguous-scope",
      port: {
        load: vi.fn(async () => ({ status: "absent" as const })),
        save: vi.fn(async () => ({ status: "saved" as const, revision: "rev-1" })),
        discard: vi.fn(async () => ({ status: "discarded" as const })),
        readSummaries: vi.fn(async () => new Map()),
      },
    };
    window.history.replaceState(null, "", "#/filing");
    await act(async () => {
      render(
        <BrowserSurfaceApp
          bundle={ambiguousBundle}
          adapters={{
            mode: "hash",
            draftStorage,
            onDiagnostics: (batch) => withWriterBatches.push([...batch]),
          }}
        />,
      );
    });
    await vi.waitFor(() => {
      const matches = (withWriterBatches.at(-1) ?? []).filter(
        (diag) => diag.details?.reason === "ambiguous-autosave-action",
      );
      expect(matches).toHaveLength(1);
      expect(matches[0]?.code).toBe("BUNDLE-DOCUMENT-SHAPE");
    });

    // 3. Reopening a saved clean draft that reuses its writer replays the retained finding
    const storedDrafts = new Map<string, { revision: string; snapshotJson: string; responseJson: string }>();
    const reusableStorage = {
      scope: "ambiguous-reopen-scope",
      port: {
        load: vi.fn(async (key: { definitionUrl: string }) => {
          const existing = storedDrafts.get(key.definitionUrl);
          return existing ? { status: "loaded" as const, draft: existing } : { status: "absent" as const };
        }),
        save: vi.fn(async (input: { key: { definitionUrl: string }; snapshotJson: string; responseJson: string }) => {
          const revision = `rev-${storedDrafts.size + 1}`;
          storedDrafts.set(input.key.definitionUrl, {
            revision,
            snapshotJson: input.snapshotJson,
            responseJson: input.responseJson,
          });
          return { status: "saved" as const, revision };
        }),
        discard: vi.fn(async () => ({ status: "discarded" as const })),
        readSummaries: vi.fn(async () => new Map()),
      },
    };
    const reopenSurface = {
      ...filingSurface,
      routes: [
        ...filingSurface.routes,
        { id: "overview", path: "/overview", title: "Overview", routeClass: "intake", slots: [] },
      ],
    } as unknown as SurfaceDocument;
    const reopenBundle: ResolvedBundle = {
      ...ambiguousBundle,
      surfaces: [reopenSurface],
      responseActions: [
        {
          $formspecResponseActions: "1.0",
          version: "1.0.0",
          targetDefinition: { url: definitionUrl },
          actions: [
            {
              id: "save",
              intent: "save-draft",
              label: { literal: "Save draft" },
              effects: [{ type: "hostEvent", eventName: "saved" }],
            },
            ...ambiguousBundle.responseActions[0]!.actions,
          ],
        } as ResponseActionsDocument,
      ],
    };
    let currentReopenDiagnostics: readonly SurfaceDiagnostic[] = [];
    window.history.replaceState(null, "", "#/filing");
    const reopenView = render(
      <BrowserSurfaceApp
        bundle={reopenBundle}
        adapters={{
          mode: "hash",
          draftStorage: reusableStorage,
          onDiagnostics: (batch) => {
            currentReopenDiagnostics = batch;
          },
        }}
      />,
    );
    await vi.waitFor(() => {
      expect(
        currentReopenDiagnostics.filter((d) => d.details?.reason === "ambiguous-autosave-action"),
      ).toHaveLength(1);
    });
    const saveBtn = [...reopenView.querySelectorAll<HTMLButtonElement>("button")].find(
      (b) => b.textContent?.trim() === "Save draft",
    );
    expect(saveBtn).toBeDefined();
    await act(async () => {
      saveBtn!.click();
    });
    await vi.waitFor(() => expect(reusableStorage.port.save).toHaveBeenCalledTimes(1));

    await act(async () => {
      window.location.hash = "/overview";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await vi.waitFor(() => {
      expect(
        currentReopenDiagnostics.filter((d) => d.details?.reason === "ambiguous-autosave-action"),
      ).toHaveLength(0);
    });

    await act(async () => {
      window.location.hash = "/filing";
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    await vi.waitFor(() => {
      expect(
        currentReopenDiagnostics.filter((d) => d.details?.reason === "ambiguous-autosave-action"),
      ).toHaveLength(1);
    });
  });

  it("keeps exactly one transition control visible when an authored ActionButton toggles live FEL when visibility", async () => {
    const { initFormspecEngine } = await import("@formspec-org/engine/init-formspec-engine");
    await initFormspecEngine();

    const definitionUrl = "https://example.test/filing-live-when";
    const filingSurface = {
      $formspecSurface: "0.2",
      id: "filing",
      entry: "filing",
      routes: [
        {
          id: "filing",
          path: "/filing",
          title: "Filing",
          routeClass: "intake",
          slots: [
            {
              id: "form",
              slotType: "definition-form",
              binding: { definitionRef: definitionUrl },
            },
          ],
          transitions: [{ trigger: "autosave", to: "overview" }],
        },
        {
          id: "overview",
          path: "/overview",
          title: "Overview",
          routeClass: "intake",
          slots: [],
        },
      ],
    } as unknown as SurfaceDocument;

    const liveWhenBundle: ResolvedBundle = {
      ...bundle,
      surfaces: [filingSurface],
      responseActions: [
        {
          $formspecResponseActions: "1.0",
          version: "1.0.0",
          targetDefinition: { url: definitionUrl },
          actions: [
            {
              id: "autosave",
              intent: "autosave",
              label: { literal: "Autosave" },
              effects: [{ type: "hostEvent", eventName: "draft-autosaved" }],
            },
          ],
        } as ResponseActionsDocument,
      ],
      definitions: new Map([
        [
          definitionUrl,
          {
            $formspec: "1.0",
            url: definitionUrl,
            version: "1.0.0",
            title: "Filing",
            items: [
              { key: "show", type: "field", dataType: "boolean", label: "Show checkpoint" },
            ],
          } as unknown as FormDefinition,
        ],
      ]),
    };

    const container = render(
      <SurfaceApp
        bundle={liveWhenBundle}
        location="/filing"
        onNavigate={() => {}}
        onFireTransition={async () => ({ advanced: true })}
        resolveDefinitionComponent={() =>
          ({
            $formspecComponent: "1.0",
            version: "1.0.0",
            targetDefinition: { url: definitionUrl },
            tree: {
              component: "Stack",
              children: [
                { component: "Toggle", bind: "show" },
                {
                  component: "ActionButton",
                  actionRef: "autosave",
                  label: { literal: "Checkpoint now" },
                  when: "$show = true",
                },
              ],
            },
          }) as never
        }
        setDocumentTitle={false}
      />,
    );

    const transitionButtons = () =>
      [...container.querySelectorAll<HTMLButtonElement>("button")].map((b) =>
        b.textContent?.trim(),
      ).filter((name) => name === "Checkpoint now" || name === "Continue to Overview");

    // Initially `$show = true` is false: authored button hidden, Surface fallback shown!
    expect(transitionButtons()).toEqual(["Continue to Overview"]);

    // Toggle `show` on -> authored button shown, Surface fallback suppressed!
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(checkbox).not.toBeNull();
    await act(async () => {
      checkbox!.click();
    });
    expect(transitionButtons()).toEqual(["Checkpoint now"]);

    // Toggle `show` off -> authored button hidden again, Surface fallback restored!
    await act(async () => {
      checkbox!.click();
    });
    expect(transitionButtons()).toEqual(["Continue to Overview"]);
  });

  it("reconciles retained draft writers and Surface diagnostics when responseActionsDocument changes in either direction", async () => {
    const { initFormspecEngine } = await import("@formspec-org/engine/init-formspec-engine");
    const { BrowserSurfaceApp } = await import("../src/BrowserSurfaceApp.js");
    await initFormspecEngine();

    const definitionUrl = "https://example.test/reconcile-autosave";
    const filingDef = {
      $formspec: "1.0",
      url: definitionUrl,
      version: "1.0.0",
      title: "Filing",
      items: [{ key: "answer", type: "field", dataType: "string", label: "Answer" }],
    } as unknown as FormDefinition;
    const filingSurface = {
      $formspecSurface: "0.2",
      id: "filing",
      entry: "filing",
      routes: [
        {
          id: "filing",
          path: "/filing",
          title: "Filing",
          routeClass: "intake",
          slots: [{ id: "form", slotType: "definition-form", binding: { definitionRef: definitionUrl } }],
        },
        { id: "overview", path: "/overview", title: "Overview", routeClass: "intake", slots: [] },
      ],
    } as unknown as SurfaceDocument;

    const makeActions = (autosaveCount: number): ResponseActionsDocument =>
      ({
        $formspecResponseActions: "1.0",
        version: "1.0.0",
        targetDefinition: { url: definitionUrl },
        actions: [
          {
            id: "save",
            intent: "save-draft",
            label: { literal: "Save draft" },
            effects: [{ type: "hostEvent", eventName: "saved" }],
          },
          ...Array.from({ length: autosaveCount }, (_, index) => ({
            id: `auto${index}`,
            intent: "autosave" as const,
            effects: [{ type: "hostEvent" as const, eventName: `auto-${index}` }],
          })),
        ],
      }) as ResponseActionsDocument;

    const makeBundle = (autosaveCount: number): ResolvedBundle => ({
      ...bundle,
      surfaces: [filingSurface],
      definitions: new Map([[definitionUrl, filingDef]]),
      responseActions: [makeActions(autosaveCount)],
    });

    const ambiguityCount = (batch: readonly SurfaceDiagnostic[]) =>
      batch.filter((d) => d.details?.reason === "ambiguous-autosave-action").length;

    const setAnswer = (container: HTMLElement, value: string) => {
      const input = container.querySelector<HTMLInputElement>("input");
      expect(input).not.toBeNull();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    };

    // 1. No-storage SurfaceApp clears stale ambiguity when replaced doc(2) -> doc(1), and re-raises on doc(1) -> doc(2)
    let noStorageDiagnostics: readonly SurfaceDiagnostic[] = [];
    const noStorageHost = document.createElement("div");
    document.body.append(noStorageHost);
    const { createRoot } = await import("react-dom/client");
    const noStorageRoot = createRoot(noStorageHost);
    try {
      await act(async () => {
        noStorageRoot.render(
          <SurfaceApp
            bundle={makeBundle(2)}
            location="/filing"
            onNavigate={() => {}}
            onDiagnostics={(batch) => { noStorageDiagnostics = batch; }}
            setDocumentTitle={false}
          />,
        );
      });
      await vi.waitFor(() => expect(ambiguityCount(noStorageDiagnostics)).toBe(1));

      await act(async () => {
        noStorageRoot.render(
          <SurfaceApp
            bundle={makeBundle(1)}
            location="/filing"
            onNavigate={() => {}}
            onDiagnostics={(batch) => { noStorageDiagnostics = batch; }}
            setDocumentTitle={false}
          />,
        );
      });
      await vi.waitFor(() => expect(ambiguityCount(noStorageDiagnostics)).toBe(0));

      await act(async () => {
        noStorageRoot.render(
          <SurfaceApp
            bundle={makeBundle(2)}
            location="/filing"
            onNavigate={() => {}}
            onDiagnostics={(batch) => { noStorageDiagnostics = batch; }}
            setDocumentTitle={false}
          />,
        );
      });
      await vi.waitFor(() => expect(ambiguityCount(noStorageDiagnostics)).toBe(1));
    } finally {
      await act(async () => { noStorageRoot.unmount(); });
      noStorageHost.remove();
    }

    // 2. Storage-backed BrowserSurfaceApp across save -> Overview -> bundle replacement -> return -> edit
    for (const [firstCount, secondCount, expectedSavesAfterEdit, expectedDiagnostics] of [
      [1, 1, 2, 0],
      [2, 1, 2, 0],
      [1, 2, 1, 1],
    ] as const) {
      let revisionCounter = 0;
      const stored = new Map<string, { revision: string; snapshotJson: string; responseJson: string }>();
      const storage = {
        scope: `reconcile-${firstCount}-to-${secondCount}`,
        port: {
          load: vi.fn(async (key: { definitionUrl: string }) => {
            const existing = stored.get(key.definitionUrl);
            return existing ? { status: "loaded" as const, draft: existing } : { status: "absent" as const };
          }),
          save: vi.fn(async (input: { key: { definitionUrl: string }; snapshotJson: string; responseJson: string }) => {
            revisionCounter += 1;
            const revision = `rev-${revisionCounter}`;
            stored.set(input.key.definitionUrl, {
              revision,
              snapshotJson: input.snapshotJson,
              responseJson: input.responseJson,
            });
            return { status: "saved" as const, revision };
          }),
          discard: vi.fn(async () => ({ status: "discarded" as const })),
          readSummaries: vi.fn(async () => new Map()),
        },
      };

      let liveDiagnostics: readonly SurfaceDiagnostic[] = [];
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      window.history.replaceState(null, "", "#/filing");
      const adapters = {
        mode: "hash" as const,
        draftStorage: storage,
        onDiagnostics: (batch: readonly SurfaceDiagnostic[]) => { liveDiagnostics = batch; },
      };

      try {
        await act(async () => {
          root.render(<BrowserSurfaceApp bundle={makeBundle(firstCount)} adapters={adapters} />);
        });
        await vi.waitFor(() => expect(ambiguityCount(liveDiagnostics)).toBe(firstCount > 1 ? 1 : 0));

        const saveBtn = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
          (b) => b.textContent?.trim() === "Save draft",
        );
        expect(saveBtn).toBeDefined();
        await act(async () => { saveBtn!.click(); });
        await vi.waitFor(() => expect(storage.port.save).toHaveBeenCalledTimes(1));

        // Leave to Overview
        await act(async () => {
          window.location.hash = "/overview";
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        });
        await vi.waitFor(() => expect(ambiguityCount(liveDiagnostics)).toBe(0));

        // Replace bundle while on Overview with the same Definition & storage
        await act(async () => {
          root.render(<BrowserSurfaceApp bundle={makeBundle(secondCount)} adapters={adapters} />);
        });

        // Return to Filing (reuses clean writer at matching revision)
        await act(async () => {
          window.location.hash = "/filing";
          window.dispatchEvent(new HashChangeEvent("hashchange"));
        });
        await vi.waitFor(() => expect(host.querySelector("input")).not.toBeNull());
        await vi.waitFor(() => expect(ambiguityCount(liveDiagnostics)).toBe(expectedDiagnostics));

        // Edit answer and wait past the 400ms autosave debounce window
        await act(async () => {
          setAnswer(host, `updated-${firstCount}-${secondCount}`);
        });
        await new Promise((resolve) => setTimeout(resolve, 650));

        expect(storage.port.save).toHaveBeenCalledTimes(expectedSavesAfterEdit);
        expect(ambiguityCount(liveDiagnostics)).toBe(expectedDiagnostics);
      } finally {
        await act(async () => { root.unmount(); });
        host.remove();
      }
    }

    // 3. In-place action document fix while mounted with unsaved edits preserves unsaved edits and enables autosave
    let dirtyRevision = 0;
    const dirtyStored = new Map<string, { revision: string; snapshotJson: string; responseJson: string }>();
    const dirtyStorage = {
      scope: "reconcile-dirty-in-place",
      port: {
        load: vi.fn(async (key: { definitionUrl: string }) => {
          const existing = dirtyStored.get(key.definitionUrl);
          return existing ? { status: "loaded" as const, draft: existing } : { status: "absent" as const };
        }),
        save: vi.fn(async (input: { key: { definitionUrl: string }; snapshotJson: string; responseJson: string }) => {
          dirtyRevision += 1;
          const revision = `rev-${dirtyRevision}`;
          dirtyStored.set(input.key.definitionUrl, {
            revision,
            snapshotJson: input.snapshotJson,
            responseJson: input.responseJson,
          });
          return { status: "saved" as const, revision };
        }),
        discard: vi.fn(async () => ({ status: "discarded" as const })),
        readSummaries: vi.fn(async () => new Map()),
      },
    };
    let dirtyDiagnostics: readonly SurfaceDiagnostic[] = [];
    const dirtyHost = document.createElement("div");
    document.body.append(dirtyHost);
    const dirtyRoot = createRoot(dirtyHost);
    window.history.replaceState(null, "", "#/filing");
    const dirtyAdapters = {
      mode: "hash" as const,
      draftStorage: dirtyStorage,
      onDiagnostics: (batch: readonly SurfaceDiagnostic[]) => { dirtyDiagnostics = batch; },
    };
    try {
      await act(async () => {
        dirtyRoot.render(<BrowserSurfaceApp bundle={makeBundle(2)} adapters={dirtyAdapters} />);
      });
      await vi.waitFor(() => expect(dirtyHost.querySelector("input")).not.toBeNull());
      await vi.waitFor(() => expect(ambiguityCount(dirtyDiagnostics)).toBe(1));

      await act(async () => { setAnswer(dirtyHost, "unsaved-work"); });
      await new Promise((resolve) => setTimeout(resolve, 550));
      expect(dirtyStorage.port.save).toHaveBeenCalledTimes(0);

      await act(async () => {
        dirtyRoot.render(<BrowserSurfaceApp bundle={makeBundle(1)} adapters={dirtyAdapters} />);
      });
      await vi.waitFor(() => expect(ambiguityCount(dirtyDiagnostics)).toBe(0));
      expect(dirtyHost.querySelector<HTMLInputElement>("input")?.value).toBe("unsaved-work");
      await vi.waitFor(() => expect(dirtyStorage.port.save).toHaveBeenCalledTimes(1), { timeout: 2000 });
    } finally {
      await act(async () => { dirtyRoot.unmount(); });
      dirtyHost.remove();
    }
  });

  it("reconciles Surface fallback controls with live computed CSS visibility and modal state", async () => {
    const { initFormspecEngine } = await import("@formspec-org/engine/init-formspec-engine");
    await initFormspecEngine();

    const definitionUrl = "https://example.test/filing-computed-visibility";
    const filingSurface = {
      $formspecSurface: "0.2",
      id: "filing",
      entry: "filing",
      routes: [
        {
          id: "filing",
          path: "/filing",
          title: "Filing",
          routeClass: "intake",
          slots: [{ id: "form", slotType: "definition-form", binding: { definitionRef: definitionUrl } }],
          transitions: [{ trigger: "autosave", to: "overview" }],
        },
        { id: "overview", path: "/overview", title: "Overview", routeClass: "intake", slots: [] },
      ],
    } as unknown as SurfaceDocument;
    const visBundle: ResolvedBundle = {
      ...bundle,
      surfaces: [filingSurface],
      responseActions: [
        {
          $formspecResponseActions: "1.0",
          version: "1.0.0",
          targetDefinition: { url: definitionUrl },
          actions: [
            {
              id: "autosave",
              intent: "autosave",
              label: { literal: "Autosave" },
              effects: [{ type: "hostEvent", eventName: "draft-autosaved" }],
            },
          ],
        } as ResponseActionsDocument,
      ],
      definitions: new Map([
        [
          definitionUrl,
          {
            $formspec: "1.0",
            url: definitionUrl,
            version: "1.0.0",
            title: "Filing",
            items: [{ key: "answer", type: "field", dataType: "string", label: "Answer" }],
          } as unknown as FormDefinition,
        ],
      ]),
    };

    const cases = [
      {
        name: "initial-below-collapse",
        tree: {
          component: "Stack",
          style: { visibility: "  CoLlApSe " },
          children: [
            { component: "ActionButton", actionRef: "autosave", label: { literal: "Checkpoint now" }, style: { visibility: "initial" } },
          ],
        },
        expectFallback: false,
      },
      {
        name: "var-resolving-to-hidden",
        tree: {
          component: "Stack",
          style: { "--checkpoint-visibility": "hidden" },
          children: [
            { component: "ActionButton", actionRef: "autosave", label: { literal: "Checkpoint now" }, style: { visibility: "var(--checkpoint-visibility)" } },
          ],
        },
        expectFallback: true,
      },
      {
        name: "display-none-over-visible",
        tree: {
          component: "Stack",
          style: { display: "  NoNe " },
          children: [
            { component: "ActionButton", actionRef: "autosave", label: { literal: "Checkpoint now" }, style: { visibility: " VisIble " } },
          ],
        },
        expectFallback: true,
      },
      {
        name: "button-modal-opener-reachable",
        tree: {
          component: "Modal",
          trigger: "button",
          title: "Confirm checkpoint",
          triggerLabel: "Open checkpoint",
          when: "true",
          children: [
            { component: "ActionButton", actionRef: "autosave", label: { literal: "Checkpoint now" } },
          ],
        },
        expectFallback: false,
      },
    ] as const;

    for (const testCase of cases) {
      const view = render(
        <SurfaceApp
          bundle={visBundle}
          location="/filing"
          onNavigate={() => {}}
          onFireTransition={async () => ({ advanced: true })}
          resolveDefinitionComponent={() =>
            ({
              $formspecComponent: "1.0",
              version: "1.0.0",
              targetDefinition: { url: definitionUrl },
              tree: testCase.tree,
            }) as never
          }
          setDocumentTitle={false}
        />,
      );
      await vi.waitFor(() => {
        const fallback = [...view.querySelectorAll<HTMLButtonElement>("button")].filter(
          (b) => b.textContent?.trim() === "Continue to Overview",
        );
        expect(fallback.length, testCase.name).toBe(testCase.expectFallback ? 1 : 0);
      });
    }

    // Ancestor CSS content-visibility: hidden suppresses control and surfaces fallback
    const contentHiddenView = render(
      <SurfaceApp
        bundle={visBundle}
        location="/filing"
        onNavigate={() => {}}
        onFireTransition={async () => ({ advanced: true })}
        resolveDefinitionComponent={() =>
          ({
            $formspecComponent: "1.0",
            version: "1.0.0",
            targetDefinition: { url: definitionUrl },
            tree: {
              component: "Stack",
              style: { contentVisibility: "hidden" },
              children: [
                { component: "ActionButton", actionRef: "autosave", label: { literal: "Checkpoint now" } },
              ],
            },
          }) as never
        }
        setDocumentTitle={false}
      />,
    );
    await vi.waitFor(() => {
      const fallback = [...contentHiddenView.querySelectorAll<HTMLButtonElement>("button")].filter(
        (b) => b.textContent?.trim() === "Continue to Overview",
      );
      expect(fallback.length).toBe(1);
    });

    // Two independent slots with identical authored Tabs id must not collide on tab opener IDs
    const multiTabSurface = {
      $formspecSurface: "0.2",
      id: "filing-multi-tabs",
      entry: "filing",
      routes: [
        {
          id: "filing",
          path: "/filing",
          title: "Filing",
          routeClass: "intake",
          slots: [
            { id: "first", slotType: "definition-form", binding: { definitionRef: definitionUrl } },
            { id: "form", slotType: "definition-form", binding: { definitionRef: definitionUrl } },
          ],
          transitions: [{ trigger: "autosave", to: "overview" }],
        },
        { id: "overview", path: "/overview", title: "Overview", routeClass: "intake", slots: [] },
      ],
    } as unknown as SurfaceDocument;
    const multiTabView = render(
      <SurfaceApp
        bundle={{ ...visBundle, surfaces: [multiTabSurface] }}
        location="/filing"
        onNavigate={() => {}}
        onFireTransition={async () => ({ advanced: true })}
        resolveDefinitionComponent={({ slotId }) =>
          ({
            $formspecComponent: "1.0",
            version: "1.0.0",
            targetDefinition: { url: definitionUrl },
            tree: {
              component: "Tabs",
              id: "common",
              tabLabels: ["First tab", "Second tab"],
              children: [
                { component: "Stack", children: [{ component: "TextInput", bind: "answer" }] },
                {
                  component: "Stack",
                  children: slotId === "first"
                    ? [{ component: "TextInput", bind: "answer" }]
                    : [{ component: "ActionButton", actionRef: "autosave", label: { literal: "Checkpoint now" } }],
                },
              ],
            },
          }) as never
        }
        setDocumentTitle={false}
      />,
    );
    await vi.waitFor(() => {
      const tabs = [...multiTabView.querySelectorAll<HTMLButtonElement>('[role="tab"]')].filter(
        (tab) => tab.textContent?.trim() === "Second tab",
      );
      expect(tabs).toHaveLength(2);
      expect(tabs[0]!.id).not.toBe(tabs[1]!.id);
      const fallback = [...multiTabView.querySelectorAll<HTMLButtonElement>("button")].filter(
        (b) => b.textContent?.trim() === "Continue to Overview",
      );
      expect(fallback).toHaveLength(0);
    });
  });

  it("stops sequential automatic writes when ambiguity appears mid-flight and reconciles pending draft loads before publishing findings", async () => {
    const { initFormspecEngine } = await import("@formspec-org/engine/init-formspec-engine");
    const { createDraftSession } = await import("../src/draft-session.js");
    const { BrowserSurfaceApp } = await import("../src/BrowserSurfaceApp.js");
    const { createRoot } = await import("react-dom/client");
    await initFormspecEngine();

    const definitionUrl = "https://example.test/inflight-and-pending-load";
    const def = {
      $formspec: "1.0",
      url: definitionUrl,
      version: "1.0.0",
      title: "Application",
      items: [{ key: "answer", type: "field", dataType: "string", label: "Answer" }],
    } as unknown as FormDefinition;
    const makeDoc = (count: number): ResponseActionsDocument => ({
      $formspecResponseActions: "1.0",
      version: "1.0.0",
      targetDefinition: { url: definitionUrl },
      actions: [
        { id: "save", intent: "save-draft", label: { literal: "Save draft" }, effects: [{ type: "hostEvent", eventName: "saved" }] },
        ...Array.from({ length: count }, (_, index) => ({
          id: `auto${index}`,
          intent: "autosave" as const,
          effects: [{ type: "hostEvent" as const, eventName: `auto-${index}` }],
        })),
      ],
    }) as ResponseActionsDocument;

    // 1. Mid-flight ambiguity prevents a second automatic write and leaves later edit dirty
    let releaseFirstSave!: () => void;
    const gate = new Promise<void>((resolve) => { releaseFirstSave = resolve; });
    let writes = 0;
    const save = vi.fn(async () => {
      writes += 1;
      if (writes === 1) await gate;
      return { status: "saved" as const, revision: String(writes) };
    });
    const session = createDraftSession({
      scope: "mid-flight-ambiguity",
      port: {
        load: async () => ({ status: "absent" as const }),
        save,
        discard: async () => ({ status: "discarded" as const }),
        readSummaries: async () => new Map(),
      },
    });
    try {
      const handle = session.acquire(
        { scope: "mid-flight-ambiguity", definitionUrl },
        { plan: { definition: def }, grant: {}, responseActionsDocument: makeDoc(1) } as never,
        () => {},
      );
      const ready = await handle.result;
      if (ready.status !== "ready") throw new Error(ready.status);
      ready.engine.setValue("answer", "first");
      await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1), { timeout: 2000 });
      expect(session.syncActions(ready.writer, makeDoc(2))?.reason).toBe("ambiguous-autosave-action");
      ready.engine.setValue("answer", "later-under-ambiguity");
      releaseFirstSave();
      await ready.writer.waitForSaves();
      expect(save).toHaveBeenCalledTimes(1);
      expect(ready.writer.dirty).toBe(true);
      expect(JSON.parse((save.mock.calls[0] as unknown as [{ responseJson: string }])[0].responseJson).data).toEqual({
        answer: "first",
      });
      handle.release();
    } finally {
      releaseFirstSave();
      session.dispose();
    }

    // 2. Replacing doc while initial storage load is still pending publishes only the current doc's diagnostics
    const filingSurface = {
      $formspecSurface: "0.2",
      id: "pending-load",
      entry: "filing",
      routes: [
        {
          id: "filing",
          path: "/filing",
          title: "Filing",
          routeClass: "intake",
          slots: [{ id: "form", slotType: "definition-form", binding: { definitionRef: definitionUrl } }],
        },
      ],
    } as unknown as SurfaceDocument;
    const makeBundle = (count: number): ResolvedBundle => ({
      ...bundle,
      surfaces: [filingSurface],
      definitions: new Map([[definitionUrl, def]]),
      responseActions: [makeDoc(count)],
    });

    for (const [before, after] of [[2, 1], [1, 2]] as const) {
      let resolveLoad!: (value: { status: "absent" }) => void;
      const pendingLoad = new Promise<{ status: "absent" }>((resolve) => { resolveLoad = resolve; });
      const load = vi.fn(() => pendingLoad);
      const host = document.createElement("div");
      document.body.append(host);
      const root = createRoot(host);
      let latest: readonly SurfaceDiagnostic[] = [];
      const trace: number[] = [];
      const adapters = {
        mode: "hash" as const,
        draftStorage: {
          scope: `pending-${before}-${after}`,
          port: {
            load,
            save: vi.fn(async () => ({ status: "saved" as const, revision: "1" })),
            discard: vi.fn(async () => ({ status: "discarded" as const })),
            readSummaries: vi.fn(async () => new Map()),
          },
        },
        onDiagnostics: (batch: readonly SurfaceDiagnostic[]) => {
          latest = batch;
          trace.push(batch.filter((d) => d.details?.reason === "ambiguous-autosave-action").length);
        },
      };
      window.history.replaceState(null, "", "#/filing");
      try {
        await act(async () => {
          root.render(<BrowserSurfaceApp bundle={makeBundle(before)} adapters={adapters} />);
        });
        await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        await act(async () => {
          root.render(<BrowserSurfaceApp bundle={makeBundle(after)} adapters={adapters} />);
        });
        await act(async () => {
          resolveLoad({ status: "absent" });
        });
        await vi.waitFor(() => expect(host.querySelector("input")).not.toBeNull());
        expect(latest.filter((d) => d.details?.reason === "ambiguous-autosave-action")).toHaveLength(
          after === 2 ? 1 : 0,
        );
        if (before === 2 && after === 1) {
          expect(trace.every((count) => count === 0)).toBe(true);
        }
      } finally {
        resolveLoad({ status: "absent" });
        await act(async () => { root.unmount(); });
        host.remove();
      }
    }
  });

  it("rechecks response-dependent autosave precondition and replacement action on every queued automatic write", async () => {
    const { createFormEngine } = await import("@formspec-org/engine");
    const { createDraftWriter } = await import("../src/draft-writer.js");
    const definitionUrl = "https://example.test/forms/overlap-precondition";
    const def = {
      $formspec: "1.0",
      version: "1.0.0",
      url: definitionUrl,
      title: "Overlap precondition",
      items: [{ key: "answer", type: "field", dataType: "string", label: "Answer" }],
    } as unknown as FormDefinition;

    // 1. Same-document response-dependent precondition: both separate AND overlap edits must recheck
    for (const timing of ["overlap", "separate"] as const) {
      const engine = createFormEngine(def);
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
      const writes: string[] = [];
      const checked: string[] = [];
      let rev = 0;
      const actionDoc = {
        $formspecResponseActions: "1.0",
        version: "1.0.0",
        targetDefinition: { url: definitionUrl },
        actions: [
          {
            id: "auto",
            intent: "autosave",
            preconditions: [{ id: "nonempty", expression: "@response.data.answer != ''", severity: "block" }],
            effects: [{ type: "hostEvent", eventName: "auto-saved" }],
          },
        ],
      } as unknown as ResponseActionsDocument;
      const writer = createDraftWriter({
        engine,
        key: { scope: `overlap-${timing}`, definitionUrl },
        port: {
          load: async () => ({ status: "absent" as const }),
          save: async (input) => {
            const val = JSON.parse(input.responseJson).data.answer ?? "";
            writes.push(val);
            rev += 1;
            if (rev === 1 && timing === "overlap") await firstGate;
            return { status: "saved" as const, revision: String(rev) };
          },
          discard: async () => ({ status: "discarded" as const }),
          readSummaries: async () => new Map(),
        },
        sections: [],
        actions: actionDoc,
        debounceMs: 10,
        checkpointPorts: (input) => ({
          ...input.ports,
          evaluatePrecondition: () => {
            const val = String((engine.getResponse({ profile: "off" }).data as Record<string, unknown>).answer ?? "");
            checked.push(val);
            return val.length > 0;
          },
        }),
      });
      try {
        engine.setValue("answer", "old");
        await vi.waitFor(() => expect(writes).toEqual(["old"]), { timeout: 2000 });
        if (timing === "separate") {
          await writer.waitForSaves();
        }
        engine.setValue("answer", "");
        if (timing === "overlap") {
          releaseFirst();
        }
        await writer.waitForSaves();
        await new Promise((resolve) => setTimeout(resolve, 60));
        expect({ checked, writes, dirty: writer.dirty }, timing).toEqual({
          checked: ["old", ""],
          writes: ["old"],
          dirty: true,
        });
      } finally {
        releaseFirst?.();
        writer.dispose();
        engine.dispose();
      }
    }

    // 2. Mid-flight action replacement: guarded replacement blocks second write, permitted replacement emits its new event
    const makeDoc = (opts: { id?: string; eventName: string; guarded?: boolean; ambiguous?: boolean }) => ({
      $formspecResponseActions: "1.0",
      version: "1.0.0",
      targetDefinition: { url: definitionUrl },
      actions: [
        {
          id: "manual",
          intent: "save-draft",
          label: { literal: "Save draft" },
          effects: [{ type: "hostEvent", eventName: "manual" }],
        },
        {
          id: opts.id ?? "auto",
          intent: "autosave",
          ...(opts.guarded
            ? { preconditions: [{ id: "guard", expression: "@response.data.answer != ''", severity: "block" }] }
            : {}),
          effects: [{ type: "hostEvent", eventName: opts.eventName }],
        },
        ...(opts.ambiguous
          ? [{
              id: "auto-dup",
              intent: "autosave",
              effects: [{ type: "hostEvent", eventName: "dup" }],
            }]
          : []),
      ],
    }) as unknown as ResponseActionsDocument;

    for (const mode of [
      "replace-guarded",
      "same-id-guarded",
      "replace-permitted",
      "manual-explicit",
      "correct-ambiguous",
    ] as const) {
      const engine = createFormEngine(def);
      let releaseFirst!: () => void;
      const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
      const writes: string[] = [];
      const events: string[] = [];
      const guards = vi.fn(() => false);
      let rev = 0;
      const initialDoc = makeDoc({ id: "auto", eventName: "old" });
      const writer = createDraftWriter({
        engine,
        key: { scope: `policy-${mode}`, definitionUrl },
        port: {
          load: async () => ({ status: "absent" as const }),
          save: async (input) => {
            writes.push(String(JSON.parse(input.responseJson).data.answer ?? ""));
            rev += 1;
            if (rev === 1) await firstGate;
            return { status: "saved" as const, revision: String(rev) };
          },
          discard: async () => ({ status: "discarded" as const }),
          readSummaries: async () => new Map(),
        },
        sections: [],
        actions: initialDoc,
        debounceMs: 10,
        checkpointPorts: (input) => ({
          ...input.ports,
          evaluatePrecondition: () => guards(),
          dispatchHostEvent: (eventName) => { events.push(eventName); },
        }),
      });
      try {
        engine.setValue("answer", "before");
        await vi.waitFor(() => expect(writes).toEqual(["before"]), { timeout: 2000 });
        if (mode === "replace-guarded") {
          writer.setActions(makeDoc({ id: "auto-guarded", eventName: "new", guarded: true }));
        } else if (mode === "same-id-guarded") {
          writer.setActions(makeDoc({ id: "auto", eventName: "new", guarded: true }));
        } else if (mode === "replace-permitted") {
          writer.setActions(makeDoc({ id: "auto-new", eventName: "new" }));
        } else {
          writer.setActions(makeDoc({ id: "auto", eventName: "old", ambiguous: true }));
        }
        engine.setValue("answer", "after");
        const manualPromise = mode === "manual-explicit"
          ? writer.invoke({
              document: makeDoc({ id: "auto", eventName: "old", ambiguous: true }),
              actionRef: "manual",
              ports: {
                submit: ({ profile }) => engine.getResponseSnapshot({ profile: "off" }, profile),
                dispatchHostEvent: (eventName) => { events.push(eventName); },
              },
            })
          : undefined;
        releaseFirst();
        await writer.waitForSaves();
        if (mode === "correct-ambiguous") {
          writer.setActions(makeDoc({ id: "auto-new", eventName: "new" }));
          await new Promise((resolve) => setTimeout(resolve, 60));
          await writer.waitForSaves();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 60));
          await writer.waitForSaves();
        }
        if (mode.endsWith("guarded")) {
          expect({ writes, events, guards: guards.mock.calls.length, dirty: writer.dirty }, mode).toEqual({
            writes: ["before"],
            events: ["old"],
            guards: 1,
            dirty: true,
          });
        } else {
          if (manualPromise) expect((await manualPromise).status).toBe("completed");
          expect(writes, mode).toEqual(["before", "after"]);
          expect(writer.dirty, mode).toBe(false);
          expect(events, mode).toEqual(["old", mode === "manual-explicit" ? "manual" : "new"]);
        }
      } finally {
        releaseFirst();
        writer.dispose();
        engine.dispose();
      }
    }
  });

  it("evaluates autosave preconditions before any storage write even for prepare or sign service requests", async () => {
    const { createFormEngine, invokeResponseActionAsync, resolveAutosaveResponseAction } = await import("@formspec-org/engine");
    const { createDraftWriter } = await import("../src/draft-writer.js");
    const definition = {
      $formspec: "1.0",
      url: "urn:review8:checkpoint-fenced",
      version: "1.0.0",
      title: "Form",
      items: [{ key: "answer", type: "field", dataType: "string" }],
    } as unknown as FormDefinition;

    for (const operation of ["prepare", "sign", "uncategorized"] as const) {
      const action = {
        id: "auto",
        intent: "autosave",
        preconditions: [{ id: "blocked", expression: "false", severity: "block" }],
        effects: [{ type: "serviceRequest", requestRef: "candidate", idempotencyKey: "@invocation.id", onError: "fail" }],
      };
      const doc = {
        $formspecResponseActions: "1.0",
        version: "1.0.0",
        targetDefinition: { url: definition.url },
        "x-formspec-runtime": {
          version: "1.0",
          requests: [
            {
              id: "candidate",
              ...(operation === "uncategorized" ? {} : { operation }),
              adapter: "http-json",
              request: { method: "POST", pathTemplate: "/candidate" },
            },
          ],
        },
        actions: [action],
      } as unknown as ResponseActionsDocument;
      const engine = createFormEngine(definition);
      const writes: string[] = [];
      const trace: string[] = [];
      let committed: { revision: string; responseJson: string; snapshotJson: string } | undefined;
      const evaluate = () => {
        trace.push("precondition:false");
        return false;
      };
      const writer = createDraftWriter({
        engine,
        key: { scope: `review8-${operation}`, definitionUrl: definition.url },
        sections: [],
        actions: doc,
        debounceMs: 10,
        port: {
          save: async (input) => {
            writes.push(String(JSON.parse(input.responseJson).data.answer ?? ""));
            trace.push("storage");
            committed = { revision: "1", responseJson: input.responseJson, snapshotJson: input.snapshotJson };
            return { status: "saved" as const, revision: "1" };
          },
          load: async () =>
            committed
              ? {
                  status: "loaded" as const,
                  draft: {
                    key: { scope: `review8-${operation}`, definitionUrl: definition.url },
                    definitionVersion: definition.version,
                    revision: committed.revision,
                    responseJson: committed.responseJson,
                    snapshotJson: committed.snapshotJson,
                    updatedAt: new Date().toISOString(),
                  },
                }
              : { status: "absent" as const },
          discard: async () => ({ status: "discarded" as const }),
          readSummaries: async () => new Map(),
        },
        checkpointPorts: ({ ports }) => ({ ...ports, evaluatePrecondition: evaluate }),
        invoker: ({ ports, document, actionRef }) =>
          invokeResponseActionAsync(document, actionRef, { ...ports, evaluatePrecondition: evaluate }),
      });
      try {
        expect(resolveAutosaveResponseAction(doc, definition).action?.id, operation).toBe("auto");
        engine.setValue("answer", "new");
        await vi.waitFor(() => expect(trace).toContain("precondition:false"), { timeout: 2000 });
        await writer.waitForSaves();
        expect({ writes, trace, dirty: writer.dirty }, operation).toEqual({
          writes: [],
          trace: ["precondition:false"],
          dirty: true,
        });
      } finally {
        writer.dispose();
        engine.dispose();
      }
    }
  });

  it("binds automatic Prepare/Sign to the checked edit, shares invocationId, honors mid-load removal, carries checkpointPorts, and keeps later edits unsigned", async () => {
    const { createFormEngine, invokeResponseActionAsync } = await import("@formspec-org/engine");
    const { createDraftWriter } = await import("../src/draft-writer.js");

    // 1. fence.test.ts: prepare/sign x stable, edit-during-write, remove-during-load, invocation-id
    const fenceDef = {
      $formspec: "1.0",
      version: "1",
      url: "urn:review9:filing-autosave",
      title: "Review",
      items: [{ type: "field", key: "answer", dataType: "string" }],
    } as unknown as FormDefinition;
    const fenceDocFor = (operation: "prepare" | "sign") => ({
      $formspecResponseActions: "1.0",
      version: "1",
      targetDefinition: { url: fenceDef.url },
      "x-formspec-runtime": {
        version: "1.0",
        requests: [{ id: "candidate", operation, adapter: "http-json", request: { method: "POST", pathTemplate: "/candidate" } }],
      },
      actions: [
        {
          id: "automatic",
          intent: "autosave",
          preconditions: [{ id: "eligible", expression: "$answer = 'permitted'", severity: "block" }],
          effects: [{ type: "serviceRequest", requestRef: "candidate", idempotencyKey: "@invocation.id", onError: "fail" }],
        },
      ],
    }) as unknown as ResponseActionsDocument;

    for (const operation of ["prepare", "sign"] as const) {
      for (const mode of ["stable", "edit-during-write", "remove-during-load", "invocation-id"] as const) {
        const engine = createFormEngine(fenceDef);
        const doc = fenceDocFor(operation);
        const checks: string[] = [];
        const checksId: Array<string | undefined> = [];
        const effectsId: Array<string | undefined> = [];
        const writes: string[] = [];
        const effects: Array<{ captured: string; persisted: string }> = [];
        let committed: { revision: string; responseJson: string; snapshotJson: string } | undefined;
        let release!: () => void;
        const paused = new Promise<void>((resolve) => { release = resolve; });
        let started!: () => void;
        const entered = new Promise<void>((resolve) => { started = resolve; });
        const key = { scope: `review9-${operation}-${mode}`, definitionUrl: fenceDef.url };
        const writer = createDraftWriter({
          engine,
          actions: doc,
          debounceMs: 5,
          sections: [],
          key,
          port: {
            async save(input) {
              writes.push(String(JSON.parse(input.responseJson).data.answer ?? ""));
              if (mode === "edit-during-write" && writes.length === 1) {
                started();
                await paused;
              }
              committed = { revision: String(writes.length), responseJson: input.responseJson, snapshotJson: input.snapshotJson };
              return { status: "saved" as const, revision: committed.revision };
            },
            async load() {
              if (mode === "remove-during-load") {
                started();
                await paused;
              }
              return committed
                ? {
                    status: "loaded" as const,
                    draft: {
                      key,
                      definitionVersion: fenceDef.version,
                      revision: committed.revision,
                      responseJson: committed.responseJson,
                      snapshotJson: committed.snapshotJson,
                      updatedAt: new Date().toISOString(),
                    },
                  }
                : { status: "absent" as const };
            },
            discard: async () => ({ status: "discarded" as const }),
            readSummaries: async () => new Map(),
          },
          checkpointPorts: ({ ports, invocationContext }) => ({
            ...ports,
            evaluatePrecondition: () => {
              checksId.push(invocationContext?.invocationId);
              const answer = String(engine.getDraftSnapshot().data.answer ?? "");
              checks.push(answer);
              return answer === "permitted";
            },
          }),
          invoker: async ({ ports, document: invokedDoc, actionRef, invocationContext, draftFence }) => {
            const result = await invokeResponseActionAsync(
              invokedDoc,
              actionRef,
              {
                ...ports,
                resolveIdempotencyKey: () => "synthetic-key",
                dispatchEffect: (effect, detail) => {
                  effects.push({
                    captured: String(detail.response.data.answer ?? ""),
                    persisted: String(JSON.parse(draftFence!.responseJson).data.answer ?? ""),
                  });
                  return { type: effect.type, status: "succeeded" as const };
                },
              },
              undefined,
              invocationContext,
            );
            effectsId.push(result.invocationId);
            return result;
          },
        });
        try {
          engine.setValue("answer", "permitted");
          if (mode === "edit-during-write" || mode === "remove-during-load") {
            await entered;
            if (mode === "edit-during-write") engine.setValue("answer", "refused");
            else writer.setActions(undefined);
            release();
          } else {
            await vi.waitFor(() => expect(effects.length).toBe(1), { timeout: 2000 });
          }
          await writer.waitForSaves();
          const label = `${operation} ${mode}`;
          expect(writes, label).toEqual(["permitted"]);
          if (mode === "edit-during-write") {
            expect(checks, label).toEqual(["permitted", "refused"]);
            expect(writer.dirty, label).toBe(true);
            expect(effects.every(({ captured, persisted }) => captured === persisted && captured === "permitted"), label).toBe(true);
          } else if (mode === "remove-during-load") {
            expect(effects, label).toEqual([]);
          } else if (mode === "invocation-id") {
            expect(effectsId, label).toEqual(checksId);
          } else {
            expect(checks, label).toEqual(["permitted"]);
            expect(effects, label).toEqual([{ captured: "permitted", persisted: "permitted" }]);
            expect(writer.dirty, label).toBe(false);
          }
        } finally {
          release();
          writer.dispose();
          engine.dispose();
        }
      }
    }

    // 2. unsigned-submit.test.ts: edit during or after first storage write for automatic Sign stays unsigned at explicit Submit
    const submitDef = {
      $formspec: "1.0",
      version: "1",
      url: "urn:review9:explicit-submit",
      title: "Review",
      items: [{ type: "field", key: "answer", dataType: "string" }],
    } as unknown as FormDefinition;
    const submitDoc = {
      $formspecResponseActions: "1.0",
      version: "1",
      targetDefinition: { url: submitDef.url },
      "x-formspec-runtime": {
        version: "1.0",
        requests: [{ id: "sign", operation: "sign", adapter: "http-json", request: { method: "POST", pathTemplate: "/sign" } }],
      },
      actions: [
        {
          id: "automatic",
          intent: "autosave",
          preconditions: [{ id: "allowed", expression: "$answer = 'permitted'", severity: "block" }],
          effects: [{ type: "serviceRequest", requestRef: "sign", idempotencyKey: "@invocation.id", onError: "fail" }],
        },
        { id: "submit", intent: "submit", effects: [{ type: "hostEvent", eventName: "submitted" }] },
      ],
    } as unknown as ResponseActionsDocument;
    for (const when of ["after", "during"] as const) {
      const engine = createFormEngine(submitDef);
      const writes: string[] = [];
      const signed: string[] = [];
      const submitted: string[] = [];
      let committed: { revision: string; responseJson: string; snapshotJson: string } | undefined;
      let started!: () => void;
      let release!: () => void;
      const entered = new Promise<void>((resolve) => { started = resolve; });
      const paused = new Promise<void>((resolve) => { release = resolve; });
      const key = { scope: `review9-submit-${when}`, definitionUrl: submitDef.url };
      const writer = createDraftWriter({
        engine,
        actions: submitDoc,
        debounceMs: 5,
        sections: [],
        key,
        port: {
          async save(input) {
            writes.push(String(JSON.parse(input.responseJson).data.answer ?? ""));
            if (writes.length === 1 && when === "during") {
              started();
              await paused;
            }
            committed = { revision: String(writes.length), responseJson: input.responseJson, snapshotJson: input.snapshotJson };
            return { status: "saved" as const, revision: committed.revision };
          },
          async load() {
            return committed
              ? {
                  status: "loaded" as const,
                  draft: {
                    key,
                    definitionVersion: submitDef.version,
                    revision: committed.revision,
                    responseJson: committed.responseJson,
                    snapshotJson: committed.snapshotJson,
                    updatedAt: new Date().toISOString(),
                  },
                }
              : { status: "absent" as const };
          },
          discard: async () => ({ status: "discarded" as const }),
          readSummaries: async () => new Map(),
        },
        checkpointPorts: ({ ports }) => ({
          ...ports,
          evaluatePrecondition: () => engine.getDraftSnapshot().data.answer === "permitted",
        }),
        invoker: async ({ ports, document: invokedDoc, actionRef, draftFence, invocationContext }) =>
          invokeResponseActionAsync(
            invokedDoc,
            actionRef,
            {
              ...ports,
              resolveIdempotencyKey: () => "synthetic-key",
              dispatchEffect: (effect) => {
                signed.push(String(JSON.parse(draftFence!.responseJson).data.answer ?? ""));
                return { type: effect.type, status: "succeeded" as const };
              },
              dispatchHostEvent: () => {
                submitted.push(String(JSON.parse(draftFence!.responseJson).data.answer ?? ""));
              },
            },
            undefined,
            invocationContext,
          ),
      });
      try {
        engine.setValue("answer", "permitted");
        if (when === "during") {
          await entered;
        } else {
          await vi.waitFor(() => expect(signed).toEqual(["permitted"]), { timeout: 2000 });
          await writer.waitForSaves();
        }
        engine.setValue("answer", "refused");
        release();
        await writer.waitForSaves();
        let outcome: string;
        try {
          outcome = (
            await writer.invoke({
              document: submitDoc,
              actionRef: "submit",
              ports: { submit: writer.captureActionResponse, dispatchHostEvent: () => {} },
            })
          ).status;
        } catch (error) {
          outcome = error instanceof Error ? error.message : String(error);
        }
        expect(signed, when).toEqual(["permitted"]);
        expect(submitted, when).toEqual([]);
        expect(outcome, when).toMatch(/Sign this draft/);
      } finally {
        release();
        writer.dispose();
        engine.dispose();
      }
    }

    // 3. checkpoint-adapter.test.ts: documented checkpointPorts carries resolveIdempotencyKey, dispatchEffect, and draftFence through Prepare/Sign
    const hostDef = {
      $formspec: "1.0",
      version: "1.0.0",
      url: "urn:review9:checkpoint-host",
      title: "Checkpoint",
      items: [{ type: "field", key: "answer", dataType: "string" }],
    } as unknown as FormDefinition;
    for (const operation of ["ordinary", "prepare", "sign"] as const) {
      const engine = createFormEngine(hostDef);
      const key = { scope: `review9-host-${operation}`, definitionUrl: hostDef.url };
      const events: string[] = [];
      const doc = {
        $formspecResponseActions: "1.0",
        version: "1.0.0",
        targetDefinition: { url: hostDef.url },
        "x-formspec-runtime": {
          version: "1.0",
          requests: [
            {
              id: "candidate",
              ...(operation !== "ordinary" ? { operation } : {}),
              adapter: "http-json",
              request: { method: "POST", pathTemplate: "/candidate" },
            },
          ],
        },
        actions: [
          {
            id: "auto",
            intent: "autosave",
            preconditions: [{ id: "allowed", expression: "true", severity: "block" }],
            effects: [{ type: "serviceRequest", requestRef: "candidate", idempotencyKey: "@invocation.id", onError: "fail" }],
          },
        ],
      } as unknown as ResponseActionsDocument;
      let stored: { revision: string; responseJson: string; snapshotJson: string } | undefined;
      const writer = createDraftWriter({
        engine,
        key,
        actions: doc,
        sections: [],
        debounceMs: 60000,
        port: {
          async save(input) {
            events.push("storage");
            stored = { revision: "1", responseJson: input.responseJson, snapshotJson: input.snapshotJson };
            return { status: "saved" as const, revision: "1" };
          },
          async load() {
            return stored
              ? {
                  status: "loaded" as const,
                  draft: {
                    key,
                    definitionVersion: hostDef.version,
                    revision: stored.revision,
                    responseJson: stored.responseJson,
                    snapshotJson: stored.snapshotJson,
                    updatedAt: new Date().toISOString(),
                  },
                }
              : { status: "absent" as const };
          },
          discard: async () => ({ status: "discarded" as const }),
          readSummaries: async () => new Map(),
        },
        checkpointPorts: ({ ports, invocationContext }) => ({
          ...ports,
          evaluatePrecondition() {
            events.push("check");
            return true;
          },
          resolveIdempotencyKey() {
            events.push("key");
            return invocationContext?.invocationId ?? "missing";
          },
          dispatchEffect(effect, detail, _action, context) {
            events.push(`dispatch ${detail.response.data.answer}`);
            if (operation !== "ordinary") {
              expect((context as { draftFence?: { revision?: string } }).draftFence?.revision).toBe("1");
            }
            return { type: effect.type, status: "succeeded" as const };
          },
        }),
        report(notice) {
          events.push(notice);
        },
      });
      try {
        engine.setValue("answer", "allowed");
        const left = await writer.leave();
        expect(events.filter((e) => e === "dispatch allowed"), operation).toHaveLength(1);
        expect(left, operation).toBe(true);
        expect(writer.dirty, operation).toBe(false);
      } finally {
        writer.dispose();
        engine.dispose();
      }
    }
  });
});

describe("nested Overview hub navigation", () => {
  const nestedSurface = {
    $formspecSurface: "0.4",
    id: "hub-demo",
    entry: "year-hub",
    routes: [
      {
        id: "year-hub",
        path: "/year",
        title: "Year Overview",
        slots: [
          {
            id: "year-map",
            slotType: "filing-status",
            binding: {
              groups: [
                {
                  id: "primary",
                  label: "Primary forms",
                  forms: [{ routeRef: "plan-form", slotRef: "form" }],
                },
                {
                  id: "members",
                  label: "Member forms",
                  repeat: { sourceRef: "members", memberParam: "member", memberLabelField: "name" },
                  forms: [{ routeRef: "member-form", slotRef: "form" }],
                },
              ],
            },
          },
        ],
      },
      { id: "plan-form", path: "/plan", title: "Plan Form", routeClass: "intake", slots: [] },
      {
        id: "member-hub",
        path: "/member",
        title: "Member Overview",
        slots: [
          {
            id: "member-map",
            slotType: "filing-status",
            binding: {
              groups: [
                {
                  id: "owned",
                  label: "Owned forms",
                  forms: [{ routeRef: "member-form", slotRef: "form" }],
                },
              ],
            },
          },
        ],
      },
      { id: "member-form", path: "/member-form", title: "Member Form", routeClass: "intake", slots: [] },
      {
        id: "explicit-child",
        path: "/explicit-child",
        title: "Explicit Child",
        navigation: { parent: "year-hub" },
        slots: [],
      },
      {
        id: "standalone",
        path: "/standalone",
        title: "Standalone",
        slots: [],
      },
    ],
  } as unknown as SurfaceDocument;

  it("nests explicit parent routes and inferred filing-status hub children with collapsible hubs that keep links mounted", () => {
    const nestedBundle: ResolvedBundle = {
      ...bundle,
      surfaces: [nestedSurface],
    };
    const container = render(
      <SurfaceApp bundle={nestedBundle} location="/year" onNavigate={() => {}} setDocumentTitle={false} />
    );
    const nav = container.querySelector<HTMLElement>(".fs-surface-nav");
    expect(nav?.dataset.hasHubs).toBe("true");

    const yearHubItem = container.querySelector('a[data-nav-route="year-hub"]')?.closest(".fs-surface-nav__item--hub");
    expect(yearHubItem).not.toBeNull();
    expect(yearHubItem?.querySelectorAll(".fs-surface-nav__sublist a[data-nav-route]")).toHaveLength(2);
    expect(yearHubItem?.querySelector('.fs-surface-nav__sublist a[data-nav-route="plan-form"]')).not.toBeNull();
    expect(yearHubItem?.querySelector('.fs-surface-nav__sublist a[data-nav-route="explicit-child"]')).not.toBeNull();

    // Non-repeat hub (member-hub) wins over repeat group (year-hub) for member-form.
    const memberHubItem = container.querySelector('a[data-nav-route="member-hub"]')?.closest(".fs-surface-nav__item--hub");
    expect(memberHubItem?.querySelector('.fs-surface-nav__sublist a[data-nav-route="member-form"]')).not.toBeNull();
    expect(yearHubItem?.querySelector('.fs-surface-nav__sublist a[data-nav-route="member-form"]')).toBeNull();

    // Standalone remains a top-level non-hub item.
    const standaloneItem = container.querySelector('a[data-nav-route="standalone"]')?.closest("li");
    expect(standaloneItem?.classList.contains("fs-surface-nav__item--hub")).toBe(false);

    // Collapsing toggles aria-expanded and data-expanded without unmounting child links.
    const toggle = yearHubItem?.querySelector<HTMLButtonElement>(".fs-surface-nav__hub-toggle")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(yearHubItem?.getAttribute("data-hub-expanded")).toBe("false");
    expect(yearHubItem?.querySelector('.fs-surface-nav__sublist a[data-nav-route="plan-form"]')).not.toBeNull();
  });

  it("renders flat apps without hubs unchanged", () => {
    const flatSurface = {
      $formspecSurface: "0.2",
      id: "flat",
      entry: "one",
      routes: [
        { id: "one", path: "/one", title: "One", slots: [] },
        { id: "two", path: "/two", title: "Two", slots: [] },
      ],
    } as unknown as SurfaceDocument;
    const container = render(
      <SurfaceApp bundle={{ ...bundle, surfaces: [flatSurface] }} location="/one" onNavigate={() => {}} setDocumentTitle={false} />
    );
    const nav = container.querySelector<HTMLElement>(".fs-surface-nav");
    expect(nav?.dataset.hasHubs).toBe("false");
    expect(container.querySelector(".fs-surface-nav__item--hub")).toBeNull();
    expect(container.querySelector(".fs-surface-nav__sublist")).toBeNull();
  });
});
