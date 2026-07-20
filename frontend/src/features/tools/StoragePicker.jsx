import { PlaceSelect } from '../../shared/ui'

// Селект места хранения для операций с инструментом — тонкая обёртка над общим
// PlaceSelect (единый кастомный вид), с фиксированным типом «склад».
export function StoragePicker(props) {
  return <PlaceSelect placeType="storage" {...props} />
}
