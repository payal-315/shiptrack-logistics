const mongoose = require("mongoose");
const User = require("../models/User");

const findAuthenticatedUser = (userId) => {
    const query = [{ id: userId }];

    if (mongoose.Types.ObjectId.isValid(userId)) {
        query.push({ _id: userId });
    }

    return User.findOne({ $or: query });
};

module.exports = findAuthenticatedUser;
