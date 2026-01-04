function mapCaseRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assignedTo: row.assigned_to,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { mapCaseRow };
