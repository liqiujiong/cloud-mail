<template>
  <div class="email-list-box">
    <emailScroll ref="sysEmailScroll"
                 :get-emailList="getEmailList"
                 :email-delete="allEmailDelete"
                 :star-add="starAdd"
                 :star-cancel="starCancel"
                 :show-star="false"
                 show-user-info
                 show-status
                 actionLeft="4px"
                 :show-account-icon="false"
                 :time-sort="params.timeSort"
                 :item-height="65"
                 @jump="jumpContent"
                 @refresh-before="refreshBefore"
                 @right-search="rightSearch"
                 :type="'all-email'"

    >
      <template #first>
        <el-input
            v-model="searchValue"
            :placeholder="$t('searchRecipient')"
            class="search-input"
        >
          <template #prefix>
            <div @click.stop="openSelect">
              <el-select
                  ref="mySelect"
                  v-model="params.searchType"
                  :placeholder="$t('select')"
                  class="select"
              >
                <el-option key="3" :label="$t('sender')" :value="'name'"/>
                <el-option key="4" :label="$t('subject')" :value="'subject'"/>
                <el-option key="1" :label="$t('user')" :value="'user'"/>
                <el-option key="2" :label="$t('toEmail')" :value="'toEmail'"/>
              </el-select>
              <div class="search-type">
                <span>{{ selectTitle }}</span>
                <Icon class="setting-icon" icon="mingcute:down-small-fill" width="20" height="20"/>
              </div>
            </div>
          </template>
        </el-input>
        <el-select v-model="params.type" placeholder="Select" class="status-select" @change="typeSelectChange">
          <el-option key="1" :label="$t('all')" value="all"/>
          <el-option key="3" :label="$t('received')" value="receive"/>
          <el-option key="2" :label="$t('sent')" value="send"/>
          <el-option key="4" :label="$t('selectDeleted')" value="delete"/>
          <el-option key="4" :label="$t('noRecipientTitle')" value="noone"/>
        </el-select>
        <el-select v-model="params.sourceType" placeholder="来源" class="source-select" clearable @change="sourceChange">
          <el-option label="Cloudflare" value="cloudflare_routing"/>
          <el-option label="外部 IMAP" value="external_imap"/>
          <el-option label="外部 POP3" value="external_pop3"/>
        </el-select>
        <el-select
            v-model="params.externalAccountId"
            placeholder="外部账号"
            class="external-select"
            clearable
            filterable
            remote
            reserve-keyword
            :remote-method="loadExternalAccounts"
            :loading="externalAccountLoading"
            @change="search"
        >
          <el-option
              v-for="item in externalAccounts"
              :key="item.externalAccountId"
              :label="item.email"
              :value="item.externalAccountId"
          />
        </el-select>
        <Icon
            v-if="params.externalAccountId"
            class="icon"
            :icon="selectedExternalAccount?.isFavertive ? 'fluent-color:star-16' : 'solar:star-line-duotone'"
            width="20"
            height="20"
            @click="toggleSelectedExternalAccountFavertive"
        />
        <Icon
            v-if="params.externalAccountId"
            class="icon"
            :class="{disabled: externalSyncing, syncing: externalSyncing}"
            icon="ion:sync-outline"
            width="21"
            height="21"
            @click="syncSelectedExternalAccount"
        />
        <span v-if="selectedExternalAccount" class="external-account-meta">
          <span v-if="selectedExternalAccount.remark">{{ selectedExternalAccount.remark }}</span>
          <span>{{ externalAccountStatusText(selectedExternalAccount.status) }}</span>
          <span>{{ formatExternalSyncTime(selectedExternalAccount.lastSyncTime) }}</span>
        </span>
        <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
              v-if="params.timeSort === 0" width="28" height="28"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
              width="28" height="28"/>
        <Icon class="icon clear" icon="fluent:broom-sparkle-16-regular" width="22" height="22" @click="openBathDelete"/>
      </template>
    </emailScroll>
    <el-dialog v-model="showBathDelete" :title="$t('clearEmail')" width="335"
               @closed="closedClear">
      <div class="clear-email">
        <el-input v-model="clearParams.sendName" :placeholder="$t('sender')"/>
        <el-input v-model="clearParams.subject" :placeholder="$t('subject')"/>
        <el-input v-model="clearParams.sendEmail" :placeholder="$t('sendEmailAddress')"/>
        <el-input v-model="clearParams.toEmail" :placeholder="$t('toEmail')"/>
        <el-date-picker popper-class="my-date-picker"
                        v-model="clearTime"
                        type="daterange"
                        :teleported="false"
                        unlink-panels
                        :range-separator="t('to')"
                        size="default"
        />
        <div class="clear-button">
          <el-select v-model="clearParams.type" style="width: 200px">
            <el-option key="eq" :label="t('equal')" value="eq"/>
            <el-option key="left" :label="t('leading')" value="left"/>
            <el-option key="include" :label="t('include')" value="include"/>
          </el-select>
          <el-button :loading="clearLoading" type="primary" @click="batchDelete">{{ t('clear') }}</el-button>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import {starAdd, starCancel} from "@/request/star.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {computed, defineOptions, reactive, ref, watch, onMounted} from "vue";
import {useEmailStore} from "@/store/email.js";
import {
  allEmailList,
  allEmailDelete,
  allEmailBatchDelete,
  allEmailLatest
} from "@/request/all-email.js";
import {Icon} from "@iconify/vue";
import router from "@/router/index.js";
import {useI18n} from 'vue-i18n';
import {toUtc, tzDayjs} from "@/utils/day.js";
import {sleep} from "@/utils/time-utils.js";
import {useSettingStore} from "@/store/setting.js";
import { useRoute } from 'vue-router'
import {externalAccountFavertive, externalAccountList, externalAccountSync} from "@/request/external-account.js";
import {ElMessage} from "element-plus";

defineOptions({
  name: 'all-email'
})

const route = useRoute()
const {t} = useI18n();
const emailStore = useEmailStore();
const settingStore = useSettingStore();
const clearTime = ref('')
const sysEmailScroll = ref({})
const searchValue = ref('')
const mySelect = ref()
const showBathDelete = ref(false)
const clearLoading = ref(false)
const externalAccounts = ref([])
const externalAccountLoading = ref(false)
const externalSyncing = ref(false)
let externalAccountSearchTimer = null
let lastExternalAccountKeyword = ''

onMounted(() => {
  loadExternalAccounts()
  latest();
})

const openSelect = () => {
  mySelect.value.toggleMenu()
}

const params = reactive({
  timeSort: 0,
  type: 'all',
  userEmail: null,
  toEmail: null,
  name: null,
  subject: null,
  searchType: 'toEmail',
  sourceType: null,
  externalAccountId: null
})

const clearParams = reactive({
  subject: '',
  sendEmail: '',
  sendName: '',
  startTime: '',
  toEmail: '',
  endTime: '',
  type: 'eq',
})

function resetClearParams() {
  clearParams.subject = ''
  clearParams.sendEmail = ''
  clearParams.sendName = ''
  clearParams.startTime = ''
  clearParams.toEmail = ''
  clearParams.endTime = ''
}

function closedClear() {
  resetClearParams()
  clearParams.type = 'eq'
  clearParams.endTime = ''
  clearTime.value = null
}

const selectTitle = computed(() => {
  if (params.searchType === 'user') return t('user')
  if (params.searchType === 'toEmail') return t('toEmail')
  if (params.searchType === 'name') return t('sender')
  if (params.searchType === 'subject') return t('subject')
})

const selectedExternalAccount = computed(() => {
  return externalAccounts.value.find(item => item.externalAccountId === params.externalAccountId)
})

const paramsStar = localStorage.getItem('all-email-params')
if (paramsStar) {
  const locaParams = JSON.parse(paramsStar)
  params.type = locaParams.type === 'receive' ? 'all' : (locaParams.type || 'all')
  params.timeSort = locaParams.timeSort
  params.status = locaParams.status
  params.searchType = locaParams.searchType === 'account' ? 'toEmail' : (locaParams.searchType || 'toEmail')
}

watch(() => params, () => {
  localStorage.setItem('all-email-params', JSON.stringify(params))
}, {
  deep: true
})

function openBathDelete() {
  showBathDelete.value = true
}

function batchDelete() {

  if (clearTime.value) {
    clearParams.startTime = toUtc(clearTime.value[0]).format("YYYY-MM-DD HH:mm:ss")
    clearParams.endTime = toUtc(clearTime.value[1]).add(1, 'day').format("YYYY-MM-DD HH:mm:ss")
  }

  if (!clearParams.sendEmail && !clearParams.sendName && !clearParams.subject && !clearParams.toEmail && !clearTime.value) {
    showBathDelete.value = false
    return
  }

  ElMessageBox.confirm(
      t('delAllConfirm'),
      {
        confirmButtonText: t('confirm'),
        cancelButtonText: t('cancel'),
        type: 'warning',
      }
  ).then(() => {
    clearLoading.value = true

    allEmailBatchDelete(clearParams).then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: "success",
        plain: true
      })
      resetClearParams()
      sysEmailScroll.value.refreshList();
    }).finally(() => {
      clearLoading.value = false
    })
  })
}

function rightSearch(type, value) {
  params.searchType = type;
  searchValue.value = value;
  search();
}

function refreshBefore() {
  searchValue.value = null
  params.timeSort = 0
  params.type = 'all'
  params.userEmail = null
  params.toEmail = null
  params.name = null
  params.subject = null
  params.searchType = 'toEmail'
  params.sourceType = null
  params.externalAccountId = null
}

function search() {

  params.userEmail = null
  params.toEmail = null
  params.name = null
  params.subject = null

  if (params.searchType === 'user') {
    params.userEmail = searchValue.value
  }

  if (params.searchType === 'toEmail') {
    params.toEmail = searchValue.value
  }

  if (params.searchType === 'name') {
    params.name = searchValue.value
  }

  if (params.searchType === 'subject') {
    params.subject = searchValue.value
  }

  sysEmailScroll.value.refreshList();
}

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  search()
}

function typeSelectChange() {
  search()
}

function sourceChange() {
  if (!['external_imap', 'external_pop3'].includes(params.sourceType)) {
    params.externalAccountId = null
  }
  search()
}

function loadExternalAccounts(keyword = '') {
  if (externalAccountSearchTimer) {
    clearTimeout(externalAccountSearchTimer)
  }
  externalAccountSearchTimer = setTimeout(() => {
    const searchKeyword = String(keyword || '').trim()
    if (searchKeyword === lastExternalAccountKeyword && externalAccounts.value.length > 0) {
      return
    }
    lastExternalAccountKeyword = searchKeyword
    externalAccountLoading.value = true
    externalAccountList({page: 1, size: 20, keyword: searchKeyword}).then(data => {
      externalAccounts.value = data?.list || []
    }).catch(() => {
      externalAccounts.value = []
    }).finally(() => {
      externalAccountLoading.value = false
    })
  }, 350)
}

async function syncSelectedExternalAccount(silent = false) {
  if (!params.externalAccountId || externalSyncing.value) {
    return null
  }
  externalSyncing.value = true
  try {
    const data = await externalAccountSync(params.externalAccountId, 5)
    if (!silent) {
      ElMessage({message: `同步完成，新增 ${data?.fetched || 0} 封，跳过 ${data?.skipped || 0} 封`, type: 'success', plain: true})
    }
    if (!silent || data?.fetched > 0) {
      search()
    }
    const account = selectedExternalAccount.value
    if (account) {
      account.status = 'normal'
      account.lastSyncTime = tzDayjs().utc().format('YYYY-MM-DD HH:mm:ss')
      account.lastSyncResult = `新增 ${data?.fetched || 0} 封，跳过 ${data?.skipped || 0} 封。`
    }
    return data
  } finally {
    externalSyncing.value = false
  }
}

function toggleSelectedExternalAccountFavertive() {
  const account = selectedExternalAccount.value
  if (!account) {
    return
  }
  const oldValue = account.isFavertive ? 1 : 0
  const nextValue = oldValue ? 0 : 1
  account.isFavertive = nextValue
  externalAccountFavertive(account.externalAccountId, nextValue).catch(() => {
    account.isFavertive = oldValue
  })
}

function externalAccountStatusText(status) {
  const map = {
    normal: '正常',
    disabled: '禁用',
    test_failed: '测试失败',
    sync_failed: '同步失败',
    proxy_failed: '代理失败',
    login_failed: '登录失败',
    security_check_required: '风控异常'
  }
  return map[status] || status || '-'
}

function formatExternalSyncTime(time) {
  return time ? tzDayjs(time).format('YYYY-MM-DD HH:mm:ss') : '未同步'
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'physics'
  emailStore.contentData.showStar = false
  emailStore.contentData.showReply = false
  router.push({name: 'content'})
}


function getEmailList(emailId, size) {
  return allEmailList({emailId, size, ...params})
}

async function latest() {

  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;

    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    const latestId = sysEmailScroll.value.latestEmail?.emailId

    if (autoRefresh < 2) {
      continue
    }

    if (!latestId && latestId !== 0) {
      continue
    }

    if (route.name !== 'all-email') {
      continue
    }


    if (!['all', 'receive', 'noone'].includes(params.type)) {
      continue
    }

    try {

      const curTimeSort = params.timeSort
      if (params.externalAccountId) {
        await syncSelectedExternalAccount(true)
        continue
      }

      let list = await allEmailLatest(latestId, {
        type: params.type,
        sourceType: params.sourceType,
        externalAccountId: params.externalAccountId
      })

      if (list.length === 0) {
        continue
      }

      if (!['all', 'receive', 'noone'].includes(params.type)) {
        continue
      }

      // 确保回来之后条件没变
      if (params.timeSort !== curTimeSort) {
        continue
      }

      for (let email of list) {

        sysEmailScroll.value.addItem(email)
        await sleep(50)

      }

    } catch (e) {
      if (e.code === 401 || e.code === 403) {
        settingStore.settings.autoRefresh = 0;
      }
      console.error(e)
    }

  }
}

</script>
<style>

@media (max-width: 767px) {
  .el-date-range-picker .el-picker-panel__body {
    min-width: auto;

  }

  .my-date-picker::after {
    content: "";
    position: absolute; /* 脱离文档流，不会撑开 */
    left: 0;
    right: 0;
    height: 20px;
    background: transparent; /* 方便看效果 */
  }

  .el-date-range-picker__content {
    width: 100%;
  }

  .el-date-range-picker {
    width: 300px;
  }

  .el-tooltip .el-picker_popper {
    padding-bottom: 200px;
  }

  .el-date-range-picker__content.is-left {
    border-right: 0;
  }
}

</style>
<style scoped lang="scss">
.email-list-box {
  height: 100%;
  width: 100%;
  overflow: hidden;
}


.search {
  padding-top: 5px;
  padding-bottom: 5px;
}

.select {
  position: absolute;
  width: 40px;
  opacity: 0;
  pointer-events: none;
}

.search-type {
  display: flex;
  color: var(--el-text-color-regular);
}

:deep(.header-actions) {
  padding-top: 8px;
  padding-bottom: 8px;
}

.search-input {
  width: 100%;
  max-width: 280px;
  height: 28px;

  .setting-icon {
    position: relative;
    top: 3px;
  }
}

.clear-email {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.clear-button {
  display: flex;
  align-items: center;
  gap: 15px;

  .el-button {
    width: 100%;
  }
}

.status-select {
  margin-bottom: 2px;
  width: 102px;

  :deep(.el-select__wrapper) {
    min-height: 28px;
  }
}

.source-select {
  margin-bottom: 2px;
  width: 130px;
}

.external-select {
  margin-bottom: 2px;
  width: 180px;
}

.input-with-select {
  max-width: 200px;
  border-radius: 0 4px 4px 0;
}

:deep(.input-with-select .el-input-group__append) {
  background-color: var(--el-fill-color-blank);
}

:deep(.el-select__wrapper) {
  padding: 2px 10px;
  min-height: 28px;
}

:deep(.el-date-editor.el-input__wrapper) {
  width: 303px;
}

.icon {
  cursor: pointer;

  &.disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &.syncing {
    animation: sync-rotate 0.8s linear infinite;
  }
}

.external-account-meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 360px;
  overflow: hidden;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
  font-size: 13px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@keyframes sync-rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.clear {
  @media (max-width: 419px) {
    position: absolute;
    top: 41px;
    left: 242px;
  }
}

:deep(.reload) {
  @media (max-width: 419px) {
    position: absolute;
    top: 42px;
    left: 208px;
  }
}

:deep(.delete) {
  @media (max-width: 456px) {
    position: absolute;
    top: 43px;
    left: 294px;
  }

  @media (max-width: 419px) {
    position: absolute;
    top: 43px;
    left: 282px;
  }
}
</style>
