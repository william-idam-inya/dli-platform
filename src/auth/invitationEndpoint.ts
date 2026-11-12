// Only local Vite development may point at the separately deployed QA
// invitation endpoint. Production/preview bundles always use the standard
// endpoint, regardless of browser-controlled input or environment mistakes.
export const invitationEndpoint =
  import.meta.env.DEV && import.meta.env.VITE_DLI_AUTH_QA_FUNCTION === 'admin-create-user-qa'
    ? 'admin-create-user-qa'
    : 'admin-create-user';
