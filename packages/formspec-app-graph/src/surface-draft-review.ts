/** @filedesc Resolve an authored draft review to its exact local form route and slot. */
import { ownProp, record, recordArray, stringProp } from './surface-widgets.js';

const RESPONSE_REVIEW_DELIVERY_CONTRACT_ID = '@formspec-org/surface-react/ResponseReview@0.1';
const reviewInputs = ['definition', 'response', 'presentation'];

function addressesParameters(route: unknown, names: readonly unknown[]): boolean {
  const address = record(route);
  const segments = stringProp(address, 'path')?.split('/') ?? [];
  const declared = recordArray(ownProp(address, 'params'));
  return names.every(name => typeof name === 'string' && segments.includes(`{${name}}`) &&
    declared.filter(parameter => stringProp(parameter, 'name') === name).length === 1);
}

export function resolveDraftReviewTarget(surface: unknown, reviewRoute: unknown, binding: unknown, widgetShape: unknown) {
  const document = record(surface);
  const slotBinding = record(binding);
  const review = record(ownProp(slotBinding, 'draftReview'));
  const shape = record(widgetShape);
  const inputs = recordArray(ownProp(shape, 'dataInputs'));
  if (stringProp(document, '$formspecSurface') !== '0.4' || !slotBinding || !review ||
      Object.keys(review).some(key => key !== 'routeRef' && key !== 'slotRef' && key !== 'x-generation') ||
      Object.prototype.hasOwnProperty.call(slotBinding, 'dataBindings') ||
      stringProp(shape, 'deliveryContractId') !== RESPONSE_REVIEW_DELIVERY_CONTRACT_ID ||
      inputs.length !== reviewInputs.length ||
      !reviewInputs.every(name => inputs.some(input => stringProp(input, 'name') === name && ownProp(input, 'required') === true))) {
    return { status: 'unresolved', reason: 'invalid-binding' } as const;
  }
  const routeRef = stringProp(review, 'routeRef');
  const slotRef = stringProp(review, 'slotRef');
  const routes = recordArray(ownProp(document, 'routes')).filter(route => stringProp(route, 'id') === routeRef);
  const formRoute = routes.length === 1 ? routes[0] : undefined;
  const slots = recordArray(ownProp(formRoute, 'slots')).filter(slot => stringProp(slot, 'id') === slotRef);
  const formSlot = slots.length === 1 ? slots[0] : undefined;
  const formBinding = record(ownProp(formSlot, 'binding'));
  const definitionRef = stringProp(formBinding, 'definitionRef');
  if (!routeRef || !slotRef || !formRoute || stringProp(formSlot, 'slotType') !== 'definition-form' || !formBinding || !definitionRef) {
    return { status: 'unresolved', reason: 'form-unresolved' } as const;
  }
  const mappings = Object.values(record(ownProp(formBinding, 'subjectKeys')) ?? {});
  if (!addressesParameters(formRoute, mappings) || !addressesParameters(reviewRoute, mappings)) {
    return { status: 'unresolved', reason: 'subject-keys-invalid' } as const;
  }
  return { status: 'ready', definitionRef, formBinding } as const;
}
