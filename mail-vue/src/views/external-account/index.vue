<template>
  <div class="external-account-page">
    <div class="header-actions">
      <Icon v-perm="'external-account:add'" class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <Icon v-perm="'external-account:add'" class="icon" icon="solar:import-outline" width="21" height="21" @click="openImport"/>
      <Icon v-perm="'external-account:query'" class="icon" :class="{disabled: selectedAccounts.length === 0}" icon="ion:download-outline" width="20" height="20" @click="exportSelected"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="loadList"/>
      <el-switch
          v-model="favertiveOnly"
          active-text="只看收藏"
          inactive-text="全部"
          @change="loadList"
      />
    </div>
    <el-scrollbar class="table-scrollbar">
      <el-table :data="accounts" v-loading="loading" style="height: 100%" :empty-text="''" @selection-change="selectedAccounts = $event">
        <el-table-column type="selection" width="45"/>
        <el-table-column label="收藏" width="70">
          <template #default="props">
            <Icon
                class="star-icon"
                :icon="props.row.isFavertive ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
                width="19"
                height="19"
                @click="toggleFavertive(props.row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="名称" prop="name" min-width="140"/>
        <el-table-column label="邮箱" prop="email" min-width="210"/>
        <el-table-column label="协议" width="90">
          <template #default="props">
            <el-tag :type="props.row.protocol === 'IMAP' ? 'success' : 'warning'">{{ props.row.protocol }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="服务器" min-width="190">
          <template #default="props">
            <span>{{ serverText(props.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="代理" min-width="150">
          <template #default="props">
            <span>{{ proxyText(props.row) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="props">
            <el-tag :type="props.row.status === 'normal' ? 'success' : 'danger'">{{ statusText(props.row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最近同步" min-width="170">
          <template #default="props">
            <div class="sync-result">
              <span>{{ formatSyncTime(props.row.lastSyncTime) }}</span>
              <span v-if="props.row.lastSyncResult">{{ props.row.lastSyncResult }}</span>
              <span v-if="props.row.lastErrorCode" class="error">{{ props.row.lastErrorCode }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="245" fixed="right">
          <template #default="props">
            <div class="row-actions">
              <el-button v-perm="'external-account:test'" size="small" :loading="testingId === props.row.externalAccountId" @click="testAccount(props.row)">测试</el-button>
              <el-button v-perm="'external-account:sync'" size="small" type="primary" :loading="syncingId === props.row.externalAccountId" @click="syncAccount(props.row)">同步</el-button>
              <el-dropdown trigger="click">
                <el-button size="small">更多</el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item v-perm="'external-account:set'" @click="openEdit(props.row)">编辑</el-dropdown-item>
                    <el-dropdown-item v-perm="'external-account:delete'" @click="deleteAccount(props.row)">删除</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </el-scrollbar>

    <el-dialog v-model="formShow" :title="form.externalAccountId ? '编辑外部邮箱' : '添加外部邮箱'" width="620px" @closed="resetForm">
      <el-form label-width="110px" class="account-form">
        <el-form-item label="邮箱地址">
          <el-input v-model="form.email" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="协议">
          <el-segmented v-model="form.protocol" :options="['IMAP', 'POP3']"/>
        </el-form-item>
        <template v-if="form.protocol === 'IMAP'">
          <el-form-item label="IMAP Host">
            <el-input v-model="form.imapHost" autocomplete="off"/>
          </el-form-item>
          <el-form-item label="IMAP Port">
            <el-input-number v-model="form.imapPort" :min="1" :max="65535"/>
            <el-checkbox v-model="form.imapSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
          <el-form-item label="文件夹">
            <el-input v-model="form.imapMailbox" autocomplete="off"/>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="POP3 Host">
            <el-input v-model="form.popHost" autocomplete="off"/>
          </el-form-item>
          <el-form-item label="POP3 Port">
            <el-input-number v-model="form.popPort" :min="1" :max="65535"/>
            <el-checkbox v-model="form.popSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
        </template>
        <el-form-item label="邮箱密码">
          <el-input v-model="form.password" type="password" show-password :placeholder="form.externalAccountId ? '留空表示不修改' : ''" autocomplete="new-password"/>
        </el-form-item>
        <el-divider>SOCKS5 代理</el-divider>
        <el-form-item label="代理 Host">
          <el-input v-model="form.proxyHost" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="代理 Port">
          <el-input-number v-model="form.proxyPort" :min="0" :max="65535"/>
        </el-form-item>
        <el-form-item label="代理用户名">
          <el-input v-model="form.proxyUsername" autocomplete="off"/>
        </el-form-item>
        <el-form-item label="代理密码">
          <el-input v-model="form.proxyPassword" type="password" show-password :placeholder="form.externalAccountId ? '留空表示不修改' : ''" autocomplete="new-password"/>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="formShow = false">取消</el-button>
        <el-button v-perm="'external-account:test'" :loading="testSaving" @click="testForm">测试连接</el-button>
        <el-button type="primary" :loading="saving" @click="saveForm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importShow" title="批量导入外部邮箱" width="680px" @closed="resetImportForm">
      <el-alert
          class="import-tip"
          type="info"
          show-icon
          :closable="false"
          title="每行一个账号，格式：邮箱----密码----SOCKS5代理。代理格式：用户名:密码@host:端口；代理可留空。"
      />
      <el-form label-width="110px" class="account-form import-form">
        <el-form-item label="协议">
          <el-segmented v-model="importForm.protocol" :options="['IMAP', 'POP3']"/>
        </el-form-item>
        <template v-if="importForm.protocol === 'IMAP'">
          <el-form-item label="IMAP Host">
            <el-input v-model="importForm.imapHost" autocomplete="off" placeholder="留空则按邮箱域名自动生成"/>
          </el-form-item>
          <el-form-item label="IMAP Port">
            <el-input-number v-model="importForm.imapPort" :min="1" :max="65535"/>
            <el-checkbox v-model="importForm.imapSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
          <el-form-item label="文件夹">
            <el-input v-model="importForm.imapMailbox" autocomplete="off"/>
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="POP3 Host">
            <el-input v-model="importForm.popHost" autocomplete="off" placeholder="留空则按邮箱域名自动生成"/>
          </el-form-item>
          <el-form-item label="POP3 Port">
            <el-input-number v-model="importForm.popPort" :min="1" :max="65535"/>
            <el-checkbox v-model="importForm.popSecure" class="secure-check">SSL</el-checkbox>
          </el-form-item>
        </template>
        <el-form-item label="账号列表">
          <el-input
              v-model="importForm.content"
              type="textarea"
              :rows="8"
              placeholder="rrrfctege@aol.com----应用专用密码----4366847-4acf873f:eed4cadc-global-74672633-5m@gate.kookeey.info:1000&#10;user2@aol.com----应用专用密码"
          />
        </el-form-item>
        <el-form-item v-if="importResult.length" label="导入结果">
          <div class="import-result">
            <div v-for="item in importResult" :key="item.email" :class="item.success ? 'success' : 'error'">
              {{ item.email }}：{{ item.message }}
            </div>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="import-progress" v-if="importSaving">正在导入 {{ importProgress.done }}/{{ importProgress.total }}</span>
        <el-button @click="importShow = false" :disabled="importSaving">取消</el-button>
        <el-button type="primary" :loading="importSaving" @click="saveImport">开始导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {reactive, ref, watch} from "vue";
import {
  externalAccountAdd,
  externalAccountDelete,
  externalAccountExport,
  externalAccountFavertive,
  externalAccountList,
  externalAccountSync,
  externalAccountTest,
  externalAccountUpdate
} from "@/request/external-account.js";
import {ElMessage, ElMessageBox} from "element-plus";
import {tzDayjs} from "@/utils/day.js";

const accounts = ref([])
const loading = ref(false)
const formShow = ref(false)
const importShow = ref(false)
const saving = ref(false)
const importSaving = ref(false)
const testSaving = ref(false)
const testingId = ref(0)
const syncingId = ref(0)
const favertiveOnly = ref(false)
const importResult = ref([])
const selectedAccounts = ref([])
const importProgress = reactive({
  done: 0,
  total: 0
})

const form = reactive(defaultForm())
const importForm = reactive(defaultImportForm())

loadList()

watch(() => form.email, fillServerHostByEmail)
watch(() => form.protocol, fillServerHostByEmail)

function defaultForm() {
  return {
    externalAccountId: null,
    name: '',
    email: '',
    protocol: 'IMAP',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapMailbox: 'INBOX',
    popHost: '',
    popPort: 995,
    popSecure: true,
    username: '',
    password: '',
    proxyHost: '',
    proxyPort: 0,
    proxyUsername: '',
    proxyPassword: ''
  }
}

function defaultImportForm() {
  return {
    protocol: 'IMAP',
    imapHost: '',
    imapPort: 993,
    imapSecure: true,
    imapMailbox: 'INBOX',
    popHost: '',
    popPort: 995,
    popSecure: true,
    content: ''
  }
}

function resetForm() {
  Object.assign(form, defaultForm())
}

function resetImportForm() {
  Object.assign(importForm, defaultImportForm())
  importResult.value = []
  importProgress.done = 0
  importProgress.total = 0
}

function loadList() {
  loading.value = true
  externalAccountList({isFavertive: favertiveOnly.value ? 1 : undefined}).then(data => {
    accounts.value = data || []
    selectedAccounts.value = []
  }).finally(() => {
    loading.value = false
  })
}

function openAdd() {
  resetForm()
  formShow.value = true
}

function openImport() {
  resetImportForm()
  importShow.value = true
}

function openEdit(row) {
  Object.assign(form, {
    ...defaultForm(),
    ...row,
    imapSecure: !!row.imapSecure,
    popSecure: !!row.popSecure,
    password: '',
    proxyPassword: ''
  })
  formShow.value = true
}

function getEmailDomain(email) {
  const domain = String(email || '').trim().split('@')[1]
  return domain && domain.includes('.') ? domain.toLowerCase() : ''
}

function fillServerHostByEmail() {
  const domain = getEmailDomain(form.email)
  if (!domain) {
    return
  }
  if (form.protocol === 'IMAP' && !form.imapHost.trim()) {
    form.imapHost = `imap.${domain}`
  }
  if (form.protocol === 'POP3' && !form.popHost.trim()) {
    form.popHost = `pop.${domain}`
  }
}

function saveForm() {
  saving.value = true
  const request = form.externalAccountId ? externalAccountUpdate : externalAccountAdd
  request(buildFormPayload()).then(() => {
    ElMessage({message: '保存成功', type: 'success', plain: true})
    formShow.value = false
    loadList()
  }).finally(() => {
    saving.value = false
  })
}

function buildFormPayload() {
  const email = form.email.trim()
  return {
    ...form,
    email,
    name: email,
    username: email
  }
}

function parseImportRows() {
  return importForm.content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        let parts = line.includes('----')
            ? line.split('----')
            : line.split(/,|\t/)
        parts = parts.map(item => item.trim())
        const email = parts[0] || ''
        const password = parts[1] || ''
        const proxy = parseProxy(parts[2] || '')
        return {
          index: index + 1,
          email,
          password,
          proxyRaw: parts[2] || '',
          proxy
        }
      })
}

function parseProxy(value) {
  const text = value.trim()
  if (!text) {
    return {
      host: '',
      port: 0,
      username: '',
      password: ''
    }
  }
  const atIndex = text.lastIndexOf('@')
  const auth = atIndex > -1 ? text.slice(0, atIndex) : ''
  const hostPort = atIndex > -1 ? text.slice(atIndex + 1) : text
  const colonIndex = hostPort.lastIndexOf(':')
  const host = colonIndex > -1 ? hostPort.slice(0, colonIndex) : hostPort
  const port = colonIndex > -1 ? Number(hostPort.slice(colonIndex + 1)) : 0
  const authParts = auth.split(':')
  return {
    host,
    port,
    username: authParts[0] || '',
    password: authParts.slice(1).join(':') || ''
  }
}

function buildImportPayload(row) {
  const domain = getEmailDomain(row.email)
  return {
    ...defaultForm(),
    name: row.email,
    email: row.email,
    protocol: importForm.protocol,
    imapHost: importForm.imapHost.trim() || (domain ? `imap.${domain}` : ''),
    imapPort: importForm.imapPort,
    imapSecure: importForm.imapSecure,
    imapMailbox: importForm.imapMailbox,
    popHost: importForm.popHost.trim() || (domain ? `pop.${domain}` : ''),
    popPort: importForm.popPort,
    popSecure: importForm.popSecure,
    username: row.email,
    password: row.password,
    proxyHost: row.proxy.host,
    proxyPort: row.proxy.port,
    proxyUsername: row.proxy.username,
    proxyPassword: row.proxy.password
  }
}

async function saveImport() {
  const rows = parseImportRows()
  if (rows.length === 0) {
    ElMessage({message: '请填写账号列表', type: 'warning', plain: true})
    return
  }

  const invalid = rows.find(row => !row.email || !row.password)
  if (invalid) {
    ElMessage({message: `第 ${invalid.index} 行格式错误`, type: 'error', plain: true})
    return
  }

  const invalidProxy = rows.find(row => row.proxyRaw && (!row.proxy.host || !row.proxy.port))
  if (invalidProxy) {
    ElMessage({message: `第 ${invalidProxy.index} 行代理格式错误`, type: 'error', plain: true})
    return
  }

  importSaving.value = true
  importResult.value = []
  importProgress.done = 0
  importProgress.total = rows.length

  for (const row of rows) {
    try {
      await externalAccountAdd(buildImportPayload(row))
      importResult.value.push({email: row.email, success: true, message: '成功'})
    } catch (e) {
      importResult.value.push({email: row.email, success: false, message: e.message || '失败'})
    } finally {
      importProgress.done++
    }
  }

  importSaving.value = false
  const successCount = importResult.value.filter(item => item.success).length
  ElMessage({message: `导入完成，成功 ${successCount} 个，失败 ${rows.length - successCount} 个`, type: successCount ? 'success' : 'error', plain: true})
  loadList()
}

function testForm() {
  testSaving.value = true
  externalAccountTest(buildFormPayload()).then(data => {
    ElMessage({message: `连接成功，邮件总数 ${data?.total ?? '-'}`, type: 'success', plain: true})
  }).finally(() => {
    testSaving.value = false
  })
}

function testAccount(row) {
  testingId.value = row.externalAccountId
  externalAccountTest({externalAccountId: row.externalAccountId}).then(data => {
    ElMessage({message: `连接成功，邮件总数 ${data?.total ?? '-'}`, type: 'success', plain: true})
    loadList()
  }).finally(() => {
    testingId.value = 0
  })
}

function syncAccount(row) {
  syncingId.value = row.externalAccountId
  externalAccountSync(row.externalAccountId, 5).then(data => {
    ElMessage({message: `同步完成，新增 ${data?.fetched || 0} 封，跳过 ${data?.skipped || 0} 封`, type: 'success', plain: true})
    loadList()
  }).finally(() => {
    syncingId.value = 0
  })
}

function toggleFavertive(row) {
  const oldValue = row.isFavertive ? 1 : 0
  const nextValue = oldValue ? 0 : 1
  row.isFavertive = nextValue
  externalAccountFavertive(row.externalAccountId, nextValue).then(() => {
    if (favertiveOnly.value && !nextValue) {
      loadList()
    }
  }).catch(() => {
    row.isFavertive = oldValue
  })
}

async function exportSelected() {
  if (selectedAccounts.value.length === 0) {
    ElMessage({message: '请先勾选要导出的账号', type: 'warning', plain: true})
    return
  }
  const ids = selectedAccounts.value.map(item => item.externalAccountId)
  const data = await externalAccountExport(ids)
  const content = data?.content || ''
  if (!content) {
    ElMessage({message: '没有可导出的账号', type: 'warning', plain: true})
    return
  }
  const blob = new Blob([content], {type: 'text/plain;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `external-accounts-${Date.now()}.txt`
  link.click()
  URL.revokeObjectURL(url)
}

function deleteAccount(row) {
  ElMessageBox.confirm(`确认删除 ${row.email}？不会删除远程邮箱中的邮件。`, {
    confirmButtonText: '确认',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    externalAccountDelete(row.externalAccountId).then(() => {
      ElMessage({message: '删除成功', type: 'success', plain: true})
      loadList()
    })
  })
}

function serverText(row) {
  return row.protocol === 'IMAP'
      ? `${row.imapHost}:${row.imapPort}/${row.imapMailbox || 'INBOX'}`
      : `${row.popHost}:${row.popPort}`
}

function proxyText(row) {
  return row.proxyHost ? `${row.proxyHost}:${row.proxyPort}` : '-'
}

function formatSyncTime(time) {
  return time ? tzDayjs(time).format('YYYY-MM-DD HH:mm:ss') : '-'
}

function statusText(status) {
  const map = {
    normal: '正常',
    disabled: '禁用',
    test_failed: '测试失败',
    sync_failed: '同步失败',
    proxy_failed: '代理失败',
    login_failed: '登录失败',
    security_check_required: '风控异常'
  }
  return map[status] || status
}
</script>

<style scoped lang="scss">
.external-account-page {
  height: 100%;
  width: 100%;
  overflow: hidden;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  align-items: center;
  gap: 20px;
  box-shadow: var(--header-actions-border);
  .icon {
    cursor: pointer;
    &.disabled {
      opacity: 0.35;
      pointer-events: none;
    }
  }
}

.star-icon {
  cursor: pointer;
}

.table-scrollbar {
  height: calc(100% - 42px);
}

.row-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.sync-result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  .error {
    color: var(--el-color-danger);
  }
}

.account-form {
  padding-right: 20px;
}

.secure-check {
  margin-left: 16px;
}

.import-tip {
  margin-bottom: 16px;
}

.import-form {
  .import-result {
    width: 100%;
    max-height: 160px;
    overflow: auto;
    line-height: 1.8;
    font-size: 13px;
    .success {
      color: var(--el-color-success);
    }
    .error {
      color: var(--el-color-danger);
    }
  }
}

.import-progress {
  margin-right: 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

@media (max-width: 767px) {
  :deep(.el-dialog) {
    width: calc(100vw - 24px) !important;
  }
  .account-form {
    padding-right: 0;
  }
}
</style>
