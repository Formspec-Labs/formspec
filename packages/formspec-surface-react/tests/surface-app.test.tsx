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
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/receipt/CASE-42");
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
    const { container, codes } = mount({ bundle: parameterBundle, onNavigate });

    expect(codes()).toContain("ROUTE-PARAM-UNSUPPLIED");
    expect(container.querySelector('a[href*="{caseRef}"]')).toBeNull();
    const unavailable = container.querySelector('[data-nav-route="receipt"]');
    expect(unavailable?.tagName).toBe("SPAN");
    expect(unavailable?.getAttribute("aria-disabled")).toBe("true");
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
    const { container, last } = mount({
      bundle: collisionBundle,
      location: "/shared",
      onNavigate,
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

    const unique =
      container.querySelector<HTMLAnchorElement>('a[href="/unique"]');
    expect(unique).not.toBeNull();
    act(() => unique?.click());
    expect(onNavigate).toHaveBeenCalledOnce();
    expect(onNavigate).toHaveBeenCalledWith("/unique");
  });
});
