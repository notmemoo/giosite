module.exports = (req, res) => {
    res.status(200).json({
        status: 'ok',
        time: new Date().toISOString(),
        query: req.query,
        headers: req.headers
    });
};
