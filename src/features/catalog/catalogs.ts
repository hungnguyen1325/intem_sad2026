export type CatalogId = "products" | "ages" | "suppliers";
export type Catalog = {
  id: CatalogId;
  title: string;
  description: string;
  columns: { key: string; label: string }[];
};
export const catalogs: Catalog[] = [
  {
    id: "products",
    title: "Sản phẩm",
    description: "Danh mục sản phẩm và đơn vị tính.",
    columns: [
      { key: "name", label: "Tên sản phẩm" },
      { key: "unit", label: "Đơn vị" },
      { key: "latestCode", label: "Mã gần nhất" },
      { key: "isStatus", label: "Trạng thái" },
    ],
  },
  {
    id: "ages",
    title: "Tuổi vàng",
    description: "Tuổi vàng và giá tương ứng.",
    columns: [
      { key: "name", label: "Tuổi vàng" },
      { key: "price", label: "Giá" },
      { key: "category", label: "Nhóm" },
      { key: "isStatus", label: "Trạng thái" },
    ],
  },
  {
    id: "suppliers",
    title: "Nhà cung cấp",
    description: "Thông tin nhà cung cấp và tiêu chuẩn.",
    columns: [
      { key: "name", label: "Nhà cung cấp" },
      { key: "address", label: "Địa chỉ" },
      { key: "standard", label: "Tiêu chuẩn" },
      { key: "kyhieu", label: "Ký hiệu" },
    ],
  },
];
