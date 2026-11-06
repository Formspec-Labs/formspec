/** @filedesc Slim E2E entry: webcomponent + engine init/render subpaths only (no `formspec-engine` main / fel-api). */
import { FormspecRender } from '../../../packages/formspec-webcomponent/src/index';
import { isFormspecEngineInitialized } from '@formspec-org/engine/init-formspec-engine';
import { parseJsonExact } from '@formspec-org/integrity-canonical';

customElements.define('formspec-render', FormspecRender);

const renderer = document.createElement('formspec-render');
document.getElementById('app')?.appendChild(renderer);
(window as unknown as { renderer: FormspecRender }).renderer = renderer;

(window as unknown as { isFormspecEngineInitialized: typeof isFormspecEngineInitialized }).isFormspecEngineInitialized
    = isFormspecEngineInitialized;
(window as unknown as { parseJsonExact: typeof parseJsonExact }).parseJsonExact = parseJsonExact;
