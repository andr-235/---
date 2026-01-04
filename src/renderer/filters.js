import { resolveArtifactType } from "./utils.js";

export function applyCaseFiltersAndSort(state) {
  const { cases, caseFilters, caseSort } = state;
  const search = (caseFilters.search || "").trim().toLowerCase();
  const status = (caseFilters.status || "all").toLowerCase();
  const assignee = (caseFilters.assignee || "").trim().toLowerCase();

  const filtered = cases.filter((item) => {
    const matchSearch =
      !search ||
      String(item.id).includes(search) ||
      (item.title || "").toLowerCase().includes(search);
    const matchStatus = status === "all" || item.status === status;
    const matchAssignee =
      !assignee || (item.assignedTo || "").toLowerCase().includes(assignee);
    return matchSearch && matchStatus && matchAssignee;
  });

  const sorted = [...filtered].sort((a, b) => {
    const { sortBy, sortDir } = caseSort;
    const dir = sortDir === "asc" ? 1 : -1;
    if (sortBy === "title" || sortBy === "assignedTo" || sortBy === "status") {
      const av = (a[sortBy] || "").toLowerCase();
      const bv = (b[sortBy] || "").toLowerCase();
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    }
    if (sortBy === "id") {
      return (a.id - b.id) * dir;
    }
    const av = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
    const bv = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
    return av === bv ? 0 : av > bv ? dir : -dir;
  });

  return sorted;
}

export function applyArtifactFilters(state) {
  const { artifacts, artifactFilters } = state;
  const search = (artifactFilters.search || "").trim().toLowerCase();
  const type = artifactFilters.type || "all";
  let filtered = artifacts.filter((item) => {
    const artifactType = resolveArtifactType(item);
    const matchesType = type === "all" || artifactType === type;
    const matchesSearch =
      !search ||
      (item.title || "").toLowerCase().includes(search) ||
      (item.url || "").toLowerCase().includes(search);
    return matchesType && matchesSearch;
  });

  const [sortBy, sortDir] = (artifactFilters.sort || "capturedAt:desc").split(
    ":"
  );
  const dir = sortDir === "asc" ? 1 : -1;
  filtered = filtered.sort((a, b) => {
    if (sortBy === "title" || sortBy === "source") {
      const av = (a[sortBy] || "").toLowerCase();
      const bv = (b[sortBy] || "").toLowerCase();
      if (av === bv) return 0;
      return av > bv ? dir : -dir;
    }
    const av = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
    const bv = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
    return av === bv ? 0 : av > bv ? dir : -dir;
  });

  return filtered;
}
