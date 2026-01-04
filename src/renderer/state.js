export function createEmptyLegalForm() {
  return { legalMarkId: "", articleText: "", comment: "" };
}

export function buildLegalFormFromArtifact(artifact) {
  if (!artifact) {
    return createEmptyLegalForm();
  }
  return {
    legalMarkId: artifact.legalMarkId ? String(artifact.legalMarkId) : "",
    articleText: artifact.articleText || "",
    comment: artifact.legalComment || "",
  };
}

function createStore(initialState) {
  let state = { ...initialState };
  const listeners = new Set();

  function getState() {
    return state;
  }

  function setState(partial) {
    state = { ...state, ...partial };
    listeners.forEach((listener) => listener(state));
  }

  function subscribe(listener) {
    listeners.add(listener);
    listener(state);
    return () => listeners.delete(listener);
  }

  return { getState, setState, subscribe };
}

export const store = createStore({
  cases: [],
  selectedCaseId: null,
  selectedCase: null,
  artifacts: [],
  selectedArtifactId: null,
  selectedArtifact: null,
  notes: [],
  legalMarks: [],
  legalMarkSearch: "",
  legalForm: createEmptyLegalForm(),
  legalFeedback: null,
  legalFormSaving: false,
  artifactFilters: {
    type: "all",
    search: "",
    sort: "capturedAt:desc",
  },
  caseFilters: {
    search: "",
    status: "all",
    assignee: "",
  },
  caseSort: {
    sortBy: "createdAt",
    sortDir: "desc",
  },
});

export function updateCaseFilters(patch) {
  const current = store.getState().caseFilters;
  store.setState({ caseFilters: { ...current, ...patch } });
}

export function updateArtifactFilters(patch) {
  const current = store.getState().artifactFilters;
  store.setState({ artifactFilters: { ...current, ...patch } });
}

export function getEmptyCaseSelectionState() {
  return {
    selectedCaseId: null,
    selectedCase: null,
    artifacts: [],
    selectedArtifactId: null,
    selectedArtifact: null,
    notes: [],
    legalForm: createEmptyLegalForm(),
    legalFeedback: null,
    legalFormSaving: false,
  };
}

export function getEmptyArtifactState() {
  return {
    artifacts: [],
    selectedArtifact: null,
    selectedArtifactId: null,
    legalForm: createEmptyLegalForm(),
    legalFeedback: null,
    legalFormSaving: false,
  };
}
