/*
 * Passthrough crypto stub for the open-source build. Field-level encryption is provided only on the
 * managed backend, which replaces this module. Locally every value passes through unchanged, so no
 * key is ever needed and the test suite runs as-is.
 */
function setEncryptionKey() {
}

function encryptField(value) {
    return value;
}

function decryptField(value) {
    return value;
}

module.exports = {setEncryptionKey, encryptField, decryptField};
