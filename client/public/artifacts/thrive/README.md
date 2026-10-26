# Thrive · Fitness & Health Tracker

A private fitness, nutrition, hydration, sleep and body tracker with reminders and analytics. It has no dependencies, needs no build step, and keeps all data on your device.

## Run it
- **Quickest:** double-click `index.html`.
- **Recommended:** double-click `start.bat`. It serves the app at http://localhost:8080, which turns on offline mode, "Install app" and system notifications.

## Features
| Area | What you get |
|---|---|
| **Today** | Health score (0–100), **Readiness** score (sleep, sleep debt, bedtime rhythm, yesterday's load → Primed / Steady / Recover), calories ring, macros, water quick-add, **Habits** with streaks, **Fasting timer** (13:11 to 20:4, live clock, stages, goal nudge), activity, mood/energy check-in, **guided breathing**, notes, coach tips, upcoming reminders |
| **Nutrition** | 128 foods (incl. Indian dishes) with 11 nutrients each: calories, protein, carbs, fat, fiber, sugar, sodium, potassium, calcium, iron, vitamin C. Search, categories, favorites, recents, custom foods, quick add, edit entries, copy yesterday's meal, nutrition-facts panel |
| **Hydration** | Glass visual, pace vs time of day, quick amounts, log, 14-day chart |
| **Activity** | One-tap repeat of recent workouts, 28 activities with MET-based calorie burn, steps, strength log with volume, personal records (est. 1RM), weekly WHO 150-min tracking |
| **Sleep** | Bed/wake times, quality, 7-day average, sleep debt, bedtime consistency, coach tips |
| **Body** | Weight, body fat, waist, BMI, 7-day moving average, weekly trend, goal-date projection |
| **Insights** | **This week vs last week** report, 7/30/90-day analytics: 14 charts, nutrient averages, weekday patterns, top foods, auto-generated insights and correlations (e.g. sleep vs mood) |
| **Reminders** | Water/meal/workout/sleep/weigh-in/medication reminders. They can fire at a set time or repeat on an interval, and they skip themselves once you're on track. Includes snooze, a chime and system notifications |
| **Settings** | Profile → automatic targets (Mifflin-St Jeor), manual goal overrides, theme, JSON backup/restore, CSV export, 90 days of sample data (removable in one tap), haptics |

## Design & interaction
- **Volt theme:** warm graphite and bone neutrals, a volt accent, an ink hero panel, one colour per pillar (Eat, Drink, Move, Sleep, Body), and light and dark modes.
- **Phones & tablets:** bottom tab bar, bottom-sheet dialogs, swipe left/right to change day, haptic taps, safe-area aware, no zoom-on-focus. iPad landscape gets a compact icon sidebar and a two-column layout.
- **Fast & forgiving:** deletes are instant with **Undo** (no confirmation pop-ups), onboarding can be skipped, and day totals are cached so even 90-day Insights stay quick.
- **Activity rings and week strip:** four concentric rings on Today. Tap any day in the strip to jump to it.
- **Smart picks:** food suggestions that fit your remaining calories, protein or fiber. One tap logs a serving.
- **Celebrations:** confetti when you close a ring, hit your protein goal, set a strength PR or have a perfect day.
- **Quick log button (+), command palette (Ctrl K)** and keyboard shortcuts (press `?`).
- **Insights extras:** a consistency heatmap, 15 achievements and a bed-to-wake sleep schedule chart.

## Files
- `index.html` app shell
- `css/styles.css` styles (light/dark)
- `js/foods.js` food database (per 100 g)
- `js/app.js` the app
- `sw.js`, `manifest.webmanifest` offline support and installing as an app

> Reminders only fire while Thrive is open (a background tab is fine). Push notifications that work with the app fully closed would need a server.

## Credits
- Emoji: [Noto Emoji](https://github.com/googlefonts/noto-emoji) and [Noto Animated Emoji](https://googlefonts.github.io/noto-emoji-animation/) by Google, used under Apache 2.0 / CC BY 4.0. Emoji are cached for offline use after the first load; if they cannot load, Thrive falls back to your system emoji.
