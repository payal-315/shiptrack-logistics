const sendControllerError = (res, error, fallbackMessage) => {
    if (error?.code === 11000) {
        return res.status(409).json({
            success: false,
            message: "A record with these details already exists"
        });
    }

    if (error?.name === "ValidationError" || error?.name === "CastError") {
        return res.status(400).json({
            success: false,
            message: "Invalid request data"
        });
    }

    console.error(fallbackMessage, error);
    return res.status(500).json({
        success: false,
        message: fallbackMessage
    });
};

module.exports = sendControllerError;
