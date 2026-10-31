const normalizeRole = (role) => {
    const normalizedRole = String(role || "").toLowerCase();

    if (normalizedRole === "user") {
        return "customer";
    }

    if (normalizedRole === "admin") {
        return "operations";
    }

    return normalizedRole;
};

const requireRole = (...allowedRoles) => {
    const normalizedAllowedRoles = allowedRoles.map(normalizeRole);

    return (req, res, next) => {
        const role = normalizeRole(req.user?.role);

        if (!normalizedAllowedRoles.includes(role)) {
            return res.status(403).json({
                success: false,
                message: "You do not have permission to perform this action"
            });
        }

        next();
    };
};

module.exports = {
    normalizeRole,
    requireRole
};
