// Homepage intro Version 4 ("Ruby glint"), built to ./dist/assets/intro-v4.js and loaded by the
// <script data-intro="v4"> block in index.html when the owner picks it in Studio > Intro.
import { HeroIntroV4, HeroIntroOptions } from './intro-v4/hero';

export async function mountIntroV4(options: HeroIntroOptions) {
  const intro = new HeroIntroV4(options);
  await intro.start();
  return intro;
}
