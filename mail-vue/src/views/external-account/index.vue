<template>
  <div class="external-account-page">
    <div class="header-actions">
      <Icon v-perm="'external-account:add'" class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="loadList"/>
    </div>
    <el-scrollbar class="table-scrollbar">
      <el-table :data="accounts" v-loading="loading" style="height: 100%" :empty-text="''">
        <el-table-column width="10"/>
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
              <span>{{ props.row.lastSyncTime || '-' }}</span>
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
        <el-form-item label="账号名称">
          <el-input v-model="form.name" autocomplete="off"/>
        </el-form-item>
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
        <el-form-item label="登录用户名">
          <el-input v-model="form.username" autocomplete="off"/>
        </el-form-item>
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
  </div>
</template>

<script setup>
import {Icon} from "@iconify/vue";
import {reactive, ref} from "vue";
import {
  externalAccountAdd,
  externalAccountDelete,
  externalAccountList,
  externalAccountSync,
  externalAccountTest,
  externalAccountUpdate
} from "@/request/external-account.js";
import {ElMessage, ElMessageBox} from "element-plus";

const accounts = ref([])
const loading = ref(false)
const formShow = ref(false)
const saving = ref(false)
const testSaving = ref(false)
const testingId = ref(0)
const syncingId = ref(0)

const form = reactive(defaultForm())

loadList()

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

function resetForm() {
  Object.assign(form, defaultForm())
}

function loadList() {
  loading.value = true
  externalAccountList().then(data => {
    accounts.value = data || []
  }).finally(() => {
    loading.value = false
  })
}

function openAdd() {
  resetForm()
  formShow.value = true
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

function saveForm() {
  saving.value = true
  const request = form.externalAccountId ? externalAccountUpdate : externalAccountAdd
  request({...form}).then(() => {
    ElMessage({message: '保存成功', type: 'success', plain: true})
    formShow.value = false
    loadList()
  }).finally(() => {
    saving.value = false
  })
}

function testForm() {
  testSaving.value = true
  externalAccountTest({...form}).then(data => {
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
  externalAccountSync(row.externalAccountId, 50).then(data => {
    ElMessage({message: `同步完成，新增 ${data?.fetched || 0} 封，跳过 ${data?.skipped || 0} 封`, type: 'success', plain: true})
    loadList()
  }).finally(() => {
    syncingId.value = 0
  })
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
  }
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

@media (max-width: 767px) {
  :deep(.el-dialog) {
    width: calc(100vw - 24px) !important;
  }
  .account-form {
    padding-right: 0;
  }
}
</style>
