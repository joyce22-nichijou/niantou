import { v4 as uuidv4 } from 'uuid'

const USER_ID_KEY = 'niantou_user_id'

export function getUserId() {
  let userId = localStorage.getItem(USER_ID_KEY)
  if (!userId) {
    userId = uuidv4()
    localStorage.setItem(USER_ID_KEY, userId)
  }
  return userId
}
