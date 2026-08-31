import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./client/index.html", "./client/src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      /*
       * Two shadows, tinted with `--ink` rather than black.
       *
       * A neutral-black shadow over a slightly blue-grey canvas goes muddy —
       * the grey it produces is not on the same axis as anything else on the
       * page. Tinting with the navy that already carries the type keeps the
       * whole surface on one hue.
       *
       * Each is two layers, which is what makes a shadow read as depth rather
       * than as a blur: a tight, nearly-opaque contact shadow that says the
       * edge is sitting ON something, plus a wide, very faint one that says
       * how far above it. A single mid-blur layer reads as a glow.
       *
       * Deliberately weak. The point is to lift the sheet off the canvas by a
       * millimetre, not to float it — this is a reading surface and a strong
       * shadow would put a grey halo around every line of text at the edges.
       */
      boxShadow: {
        /*
         * NOT named after a colour token.
         *
         * Tailwind emits `shadow-{name}` for every key here AND for every key
         * in `colors`. `shadow-card` was both — a size and a shadow-colour —
         * and the colour rule, emitted later, replaced the shadow with one
         * tinted to `--card`, which is near-white. It compiled, it shipped, and
         * the shadow was simply invisible. Nothing warns.
         *
         * So: check `colors` before naming anything in here. `raised` is safe;
         * `card`, `sheet`, `panel`... only `card` collides today, but the list
         * is long and grows.
         */
        sheet:
          "0 1px 2px hsl(var(--ink) / 0.04), 0 10px 28px -12px hsl(var(--ink) / 0.13)",
        raised:
          "0 1px 2px hsl(var(--ink) / 0.03), 0 5px 14px -8px hsl(var(--ink) / 0.10)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        tertiary: "hsl(var(--tertiary))",

        /*
         * Admin accents. See the block in index.css for what each one means —
         * they are semantic roles, not a palette to pick from by eye.
         */
        brand: {
          DEFAULT: "hsl(var(--brand))",
          soft: "hsl(var(--brand-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          soft: "hsl(var(--info-soft))",
        },
        deep: {
          DEFAULT: "hsl(var(--deep))",
          soft: "hsl(var(--deep-soft))",
        },
        warn: {
          DEFAULT: "hsl(var(--warn))",
          soft: "hsl(var(--warn-soft))",
        },
        good: {
          DEFAULT: "hsl(var(--good))",
          soft: "hsl(var(--good-soft))",
        },
        bad: {
          DEFAULT: "hsl(var(--bad))",
          soft: "hsl(var(--bad-soft))",
        },
        /*
         * The student-facing reading surface. Same story as above: semantic
         * roles, not a palette. `ink` is the sign-in screen's navy, `canvas`
         * is the page behind the reading column, `rule` is a hairline.
         */
        ink: {
          DEFAULT: "hsl(var(--ink))",
          soft: "hsl(var(--ink-soft))",
        },
        canvas: "hsl(var(--canvas))",
        rule: "hsl(var(--rule))",

        /*
         * ── The Wing student palette ─────────────────────────────────
         *
         * Ported from the wing5 prototype. These are `rgb(var(--x) / <alpha-value>)`
         * rather than `hsl(...)` because the prototype's own markup uses opacity
         * modifiers on them throughout — `text-plum/60`, `bg-aqua-light/60`. A token
         * that cannot take an alpha makes those utilities emit nothing at all, with
         * no error, and the element renders at full opacity. The channel values and
         * the oklch originals they came from are in index.css.
         *
         * Separate names from the admin tokens above on purpose: the admin panel is
         * out of scope for this rebuild and shares this config.
         */
        wine: {
          DEFAULT: "rgb(var(--wine) / <alpha-value>)",
          dark: "rgb(var(--wine-dark) / <alpha-value>)",
        },
        aqua: {
          DEFAULT: "rgb(var(--aqua) / <alpha-value>)",
          light: "rgb(var(--aqua-light) / <alpha-value>)",
        },
        salmon: {
          DEFAULT: "rgb(var(--salmon) / <alpha-value>)",
          light: "rgb(var(--salmon-light) / <alpha-value>)",
        },
        midnight: "rgb(var(--midnight) / <alpha-value>)",
        plum: {
          DEFAULT: "rgb(var(--plum) / <alpha-value>)",
          label: "rgb(var(--plum-label) / <alpha-value>)",
          body: "rgb(var(--plum-body) / <alpha-value>)",
          rule: "rgb(var(--plum-rule) / <alpha-value>)",
        },
        forest: "rgb(var(--forest) / <alpha-value>)",
        sand: "rgb(var(--sand) / <alpha-value>)",
        olive: "rgb(var(--olive) / <alpha-value>)",
        /*
         * The prototype's page colour. Named `wing-canvas`, not `canvas`: `canvas`
         * is already taken above by the retired student UI's token, and silently
         * repointing a name the admin config still resolves is the kind of change
         * that shows up as one screen looking slightly wrong months later.
         */
        "wing-canvas": "rgb(var(--wing-canvas) / <alpha-value>)",
        "wing-border": "rgb(var(--wing-border) / <alpha-value>)",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        /* Montserrat is already preloaded in client/index.html at 200/400/500/600. */
        wing: ['"Montserrat"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate"), require("@tailwindcss/typography")],
} satisfies Config;
