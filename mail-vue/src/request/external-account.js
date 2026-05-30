import http from '@/axios/index.js';

export function externalAccountList(params = {}) {
    return http.get('/externalAccount/list', {params})
}

export function externalAccountAdd(form) {
    return http.post('/externalAccount/add', form)
}

export function externalAccountUpdate(form) {
    return http.put('/externalAccount/update', form)
}

export function externalAccountDelete(externalAccountId) {
    return http.delete('/externalAccount/delete', {params: {externalAccountId}})
}

export function externalAccountTest(form) {
    return http.post('/externalAccount/test', form, {timeout: 60 * 1000})
}

export function externalAccountSync(externalAccountId, limit = 5) {
    return http.post('/externalAccount/sync', {externalAccountId, limit}, {timeout: 120 * 1000})
}

export function externalAccountFavertive(externalAccountId, isFavertive) {
    return http.post('/externalAccount/favertive', {externalAccountId, isFavertive})
}

export function externalAccountExport(externalAccountIds) {
    return http.post('/externalAccount/export', {externalAccountIds})
}
