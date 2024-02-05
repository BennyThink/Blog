import {
  Box,
  Table,
  Tbody,
  Text,
  Td,
  Link,
  Th,
  Thead,
  Tr,
  useToast,
  Heading,
} from "@chakra-ui/react";
import axios from "axios";
import React from "react";
import {
  ExternalLinkIcon,
  TriangleDownIcon,
  TriangleUpIcon,
} from "@chakra-ui/icons";
import { createColumnHelper } from "@tanstack/react-table";
import { chakra } from "@chakra-ui/react";
import {
  useReactTable,
  flexRender,
  getCoreRowModel,
  ColumnDef,
  SortingState,
  getSortedRowModel,
} from "@tanstack/react-table";

export interface Subscription {
  code: string;
  name: string;
  local_price: number;
  currency: string;
  usd_price: number;
}

export type DataTableProps<Data extends object> = {
  data: Data[];
  columns: ColumnDef<Data, any>[];
};

function DataTable<Data extends object>({
  data,
  columns,
}: DataTableProps<Data>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const table = useReactTable({
    columns,
    data,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
  });

  return (
    <Table>
      <Thead>
        {table.getHeaderGroups().map((headerGroup) => (
          <Tr key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              // see https://tanstack.com/table/v8/docs/api/core/column-def#meta to type this correctly
              const meta: any = header.column.columnDef.meta;
              return (
                <Th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  isNumeric={meta?.isNumeric}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext(),
                  )}

                  <chakra.span pl="4">
                    {header.column.getIsSorted() ? (
                      header.column.getIsSorted() === "desc" ? (
                        <TriangleDownIcon aria-label="sorted descending" />
                      ) : (
                        <TriangleUpIcon aria-label="sorted ascending" />
                      )
                    ) : null}
                  </chakra.span>
                </Th>
              );
            })}
          </Tr>
        ))}
      </Thead>
      <Tbody>
        {table.getRowModel().rows.map((row) => (
          <Tr key={row.id}>
            {row.getVisibleCells().map((cell) => {
              // see https://tanstack.com/table/v8/docs/api/core/column-def#meta to type this correctly
              const meta: any = cell.column.columnDef.meta;
              return (
                <Td key={cell.id} isNumeric={meta?.isNumeric}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Td>
              );
            })}
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}

const AppleTVPlus: React.FC = () => {
  document.title = "Apple TV+ Global Price";
  const [subscriptions, setSubscriptions] = React.useState<Subscription[]>([]);
  const columnHelper = createColumnHelper<Subscription>();
  const toast = useToast();
  React.useEffect(() => {
    axios
      .get("/api/apple-tv-plus")
      .then((res) => {
        setSubscriptions(res.data.data);
      })
      .catch((err) => {
        toast({
          title: "Error",
          description: err.response.data.message,
          status: "error",
          duration: 3000,
          isClosable: true,
        });
      });
  }, [toast]);

  const columns = [
    columnHelper.accessor((_, rowIndex) => rowIndex + 1, {
      id: "index", // Unique ID for the column
      header: "ID",
      cell: (info) => info.getValue(),
    }),

    columnHelper.accessor("code", {
      id: "code",
      cell: (info) => info.getValue(),
      header: "Region Code",
    }),
    columnHelper.accessor("name", {
      id: "name",
      cell: (info) => info.getValue(),
      header: "Region Name",
    }),
    columnHelper.accessor("local_price", {
      id: "local_price",
      cell: (info) => info.getValue(),
      header: "Local Price",
      meta: {
        isNumeric: true,
      },
    }),
    columnHelper.accessor("usd_price", {
      id: "usd_price",
      cell: (info) => info.getValue(),
      header: "USD Price",
      meta: {
        isNumeric: true,
      },
    }),
    columnHelper.accessor((row) => `https://tv.apple.com/${row.code}`, {
      id: "link",
      cell: (info) => (
        <Link href={info.getValue()} isExternal>
          Link <ExternalLinkIcon mx="2px" />
        </Link>
      ),
      header: "Link",
      enableSorting: false,
    }),
  ];
  return (
    <Box overflowX="auto">
      <Heading>Apple TV+ Global Price</Heading>
      <Text>You can click header to sort</Text>
      <br />
      <DataTable columns={columns} data={subscriptions} />
    </Box>
  );
};

export default AppleTVPlus;
