// The License card: its own window for the pass buyers see (front and back), the signature font, the seal and the
// words on the back. It is the Studio's pass editor on its own, so there is one place to find it.
import type { AppProps } from './registry';
import Studio from './Studio';

export default function License(props: AppProps){
  return <Studio {...props} only="pass" />;
}
